# Voltis Market Gateway

This service keeps the Databento key outside the browser and broadcasts
finalized `ohlcv-1m` bars for `YM.v.0` and `NQ.v.0` over an authenticated
websocket.

## Local development

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABENTO_API_KEY="db-..."
$env:MARKET_GATEWAY_SECRET="use-the-same-32-character-secret-as-next"
$env:ALLOWED_ORIGINS="http://127.0.0.1:3000"
uvicorn gateway:app --reload
```

Configure the Next.js app with:

```env
MARKET_GATEWAY_URL=ws://127.0.0.1:8000/ws
MARKET_GATEWAY_SECRET=use-the-same-32-character-secret-as-next
```

Use `wss://` and the deployed Voltis origin in production. `/health` reports
the Databento connection state, connected browser count, and last record time.
