from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from typing import Any

import databento as db
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("voltis.market_gateway")

DATASET = "GLBX.MDP3"
CONTINUOUS_SYMBOLS = ("YM.v.0", "NQ.v.0")
FIXED_PRICE_SCALE = 1_000_000_000


class ClientHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self._clients)

        disconnected: list[WebSocket] = []
        for websocket in clients:
            try:
                await websocket.send_json(payload)
            except Exception:
                disconnected.append(websocket)

        if disconnected:
            async with self._lock:
                for websocket in disconnected:
                    self._clients.discard(websocket)


def _record_value(record: Any, name: str) -> Any:
    value = getattr(record, name, None)
    if value is not None:
        return value
    header = getattr(record, "hd", None)
    return getattr(header, name, None) if header is not None else None


def _price(value: Any) -> float:
    numeric = float(value)
    return numeric / FIXED_PRICE_SCALE if abs(numeric) > 10_000_000 else numeric


def _timestamp_seconds(value: Any) -> int:
    numeric = int(value)
    return numeric // 1_000_000_000 if numeric > 10_000_000_000 else numeric


class DatabentoBridge:
    def __init__(self, loop: asyncio.AbstractEventLoop, hub: ClientHub) -> None:
        self.loop = loop
        self.hub = hub
        self.status = "starting"
        self.last_record_at: float | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._client: Any = None
        self._mappings: dict[int, tuple[str, str]] = {}
        self._latest_contracts: dict[str, str] = {}

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run,
            name="databento-live",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        client = self._client
        if client is not None:
            for method_name in ("stop", "close"):
                method = getattr(client, method_name, None)
                if callable(method):
                    try:
                        method()
                    except Exception:
                        logger.debug("Databento client shutdown failed", exc_info=True)
                    break
        if self._thread is not None:
            self._thread.join(timeout=5)

    def mapping_snapshot(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "mapping",
                "family": family,
                "activeContract": contract,
            }
            for family, contract in self._latest_contracts.items()
        ]

    def _broadcast(self, payload: dict[str, Any]) -> None:
        asyncio.run_coroutine_threadsafe(
            self.hub.broadcast(payload),
            self.loop,
        )

    def _set_status(self, status: str) -> None:
        self.status = status
        state = "connected" if status == "connected" else "reconnecting"
        self._broadcast({"type": "status", "state": state})

    def _run(self) -> None:
        api_key = os.getenv("DATABENTO_API_KEY")
        if not api_key:
            self.status = "missing_api_key"
            logger.error("DATABENTO_API_KEY is required")
            return

        retry_seconds = 1
        while not self._stop.is_set():
            try:
                self._client = db.Live(key=api_key)
                self._client.subscribe(
                    dataset=DATASET,
                    schema="ohlcv-1m",
                    symbols=list(CONTINUOUS_SYMBOLS),
                    stype_in="continuous",
                )
                self._set_status("connected")
                retry_seconds = 1

                for record in self._client:
                    if self._stop.is_set():
                        return
                    self._handle_record(record)

                if not self._stop.is_set():
                    raise RuntimeError("Databento live stream ended")
            except Exception:
                logger.exception("Databento live stream disconnected")
                self._set_status("reconnecting")
                self._stop.wait(retry_seconds)
                retry_seconds = min(30, retry_seconds * 2)
            finally:
                self._client = None

    def _handle_record(self, record: Any) -> None:
        self.last_record_at = time.time()
        record_name = type(record).__name__.lower()
        instrument_id = _record_value(record, "instrument_id")

        if "symbolmapping" in record_name:
            continuous = str(getattr(record, "stype_in_symbol", ""))
            active_contract = str(getattr(record, "stype_out_symbol", ""))
            family = continuous.split(".", 1)[0]
            if (
                instrument_id is not None
                and family in {"YM", "NQ"}
                and active_contract
            ):
                mapping = (family, active_contract)
                self._mappings[int(instrument_id)] = mapping
                self._latest_contracts[family] = active_contract
                self._broadcast(
                    {
                        "type": "mapping",
                        "family": family,
                        "activeContract": active_contract,
                    }
                )
            return

        if not all(
            hasattr(record, field)
            for field in ("open", "high", "low", "close", "volume")
        ):
            return

        mapping = (
            self._mappings.get(int(instrument_id))
            if instrument_id is not None
            else None
        )
        if mapping is None:
            return

        family, active_contract = mapping
        ts_event = _record_value(record, "ts_event")
        if ts_event is None:
            return

        self._broadcast(
            {
                "type": "bar",
                "family": family,
                "activeContract": active_contract,
                "bar": {
                    "time": _timestamp_seconds(ts_event),
                    "open": _price(record.open),
                    "high": _price(record.high),
                    "low": _price(record.low),
                    "close": _price(record.close),
                    "volume": int(record.volume),
                },
            }
        )


def verify_token(token: str | None) -> dict[str, Any] | None:
    secret = os.getenv("MARKET_GATEWAY_SECRET", "")
    if token is None or len(secret) < 32 or "." not in token:
        return None

    encoded, supplied_signature = token.split(".", 1)
    expected_signature = (
        hmac.new(secret.encode(), encoded.encode(), hashlib.sha256)
        .digest()
    )
    expected = base64.urlsafe_b64encode(expected_signature).decode().rstrip("=")
    if not hmac.compare_digest(supplied_signature, expected):
        return None

    try:
        padding = "=" * (-len(encoded) % 4)
        payload = json.loads(
            base64.urlsafe_b64decode(encoded + padding).decode()
        )
        if (
            not isinstance(payload.get("userId"), str)
            or int(payload.get("expiresAt", 0)) <= int(time.time())
        ):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


hub = ClientHub()
bridge: DatabentoBridge | None = None


async def heartbeat() -> None:
    while True:
        await asyncio.sleep(20)
        await hub.broadcast({"type": "heartbeat"})


@asynccontextmanager
async def lifespan(_: FastAPI):
    global bridge
    bridge = DatabentoBridge(asyncio.get_running_loop(), hub)
    bridge.start()
    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        yield
    finally:
        heartbeat_task.cancel()
        bridge.stop()


app = FastAPI(title="Voltis Market Gateway", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": bridge is not None and bridge.status == "connected",
        "status": bridge.status if bridge is not None else "starting",
        "clients": hub.client_count,
        "lastRecordAt": bridge.last_record_at if bridge is not None else None,
    }


@app.websocket("/ws")
async def market_stream(websocket: WebSocket) -> None:
    allowed_origins = {
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    }
    origin = websocket.headers.get("origin")
    if allowed_origins and origin not in allowed_origins:
        await websocket.close(code=1008, reason="Origin is not allowed")
        return

    if verify_token(websocket.query_params.get("token")) is None:
        await websocket.close(code=1008, reason="Invalid stream token")
        return

    await hub.connect(websocket)
    try:
        if bridge is not None:
            await websocket.send_json(
                {
                    "type": "status",
                    "state": (
                        "connected"
                        if bridge.status == "connected"
                        else "reconnecting"
                    ),
                }
            )
            for mapping in bridge.mapping_snapshot():
                await websocket.send_json(mapping)

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect(websocket)
