"use client";

import {
  ArrowUpFromLine,
  ChevronDown,
  Info,
  Plus,
  Repeat2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FAMILY_LABELS,
  type ExecutionSize,
  type SymbolFamily,
} from "@/lib/domain";
import { currentFuturesSession } from "@/lib/session-clock";
import { cn } from "@/lib/utils";
import { Dropdown, MenuItem, Switch } from "@/components/workspace/ui";

type OrderType = "market" | "limit" | "stop";
type Side = "sell" | "buy";

const SPECS: Record<
  SymbolFamily,
  Record<
    ExecutionSize,
    { tick: number; tickValue: number; margin: number; symbol: string }
  >
> = {
  NQ: {
    mini: { tick: 0.25, tickValue: 5, margin: 28905, symbol: "NQ1!" },
    micro: { tick: 0.25, tickValue: 0.5, margin: 2890.5, symbol: "MNQ1!" },
  },
  YM: {
    mini: { tick: 1, tickValue: 5, margin: 8060, symbol: "YM1!" },
    micro: { tick: 1, tickValue: 0.5, margin: 806, symbol: "MYM1!" },
  },
  GC: {
    mini: { tick: 0.1, tickValue: 10, margin: 12100, symbol: "GC1!" },
    micro: { tick: 0.1, tickValue: 1, margin: 1210, symbol: "MGC1!" },
  },
};

const EXCHANGES: Record<SymbolFamily, string> = {
  NQ: "CME",
  YM: "CBOT",
  GC: "COMEX",
};

const FALLBACK_PRICE: Record<SymbolFamily, number> = {
  NQ: 19164.75,
  YM: 38642,
  GC: 2355,
};

const FALLBACK_ANCHOR: Record<SymbolFamily, number> = {
  NQ: 19150,
  YM: 38600,
  GC: 2350,
};

const ACCOUNTS = ["TopstepX - $50K Combine", "Apex - $25K PA"];
const BUYING_POWER = 99143.5;
const LEVERAGE = 20;
const TICK_CHOICES = [50, 100, 150, 200, 250];

function money(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function PriceField({
  value,
  disabled = false,
  onChange,
  onSwap,
  right,
}: {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onSwap?: () => void;
  right?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center overflow-hidden rounded-lg border border-line bg-card",
        disabled && "opacity-55",
      )}
    >
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="h-full w-full min-w-0 bg-transparent px-3 font-mono text-[11px] tabular-nums text-ink outline-none"
      />
      {onSwap ? (
        <button
          onClick={onSwap}
          disabled={disabled}
          aria-label="Set to market price"
          className="v-press px-2 text-ink-3 hover:text-ink"
        >
          <Repeat2 size={13} />
        </button>
      ) : null}
      {right ? (
        <span className="whitespace-nowrap pr-3 font-mono text-[10px] text-ink-3">
          {right}
        </span>
      ) : null}
    </div>
  );
}

export function TradingPanel({
  family,
  size,
  lastPrice,
  onChangeFamily,
  onChangeSize,
  onSubmit,
  onClose,
}: {
  family: SymbolFamily;
  size: ExecutionSize;
  lastPrice: number | null;
  onChangeFamily: (family: SymbolFamily) => void;
  onChangeSize: (size: ExecutionSize) => void;
  onSubmit: (order: {
    side: Side;
    quantity: number;
    orderType: OrderType;
    price: number;
    accounts: string[];
    stopLossTicks: number | null;
    takeProfitTicks: number | null;
  }) => Promise<string>;
  onClose: () => void;
}) {
  const spec = SPECS[family][size];
  const last = lastPrice ?? FALLBACK_PRICE[family];
  const ask = last;
  const bid = last - spec.tick * 2;

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [priceText, setPriceText] = useState("");
  const [units, setUnits] = useState(4);
  const [tpOn, setTpOn] = useState(true);
  const [tpText, setTpText] = useState("");
  const [tpTicks, setTpTicks] = useState(150);
  const [slOn, setSlOn] = useState(true);
  const [slText, setSlText] = useState("");
  const [slTicks, setSlTicks] = useState(100);
  const [levels, setLevels] = useState<{ id: number; text: string }[]>([]);
  const [accounts, setAccounts] = useState<string[]>([...ACCOUNTS]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Live session clock: Asia / London / New York and open/closed, refreshed
  // every 30s so the footer tracks session handoffs and the daily halt.
  const [session, setSession] = useState(() => currentFuturesSession());
  useEffect(() => {
    const interval = window.setInterval(
      () => setSession(currentFuturesSession()),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  // Re-seed prices whenever the instrument context changes.
  const seedKey = `${family}:${size}`;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seededFor !== seedKey) {
    const anchor = lastPrice
      ? Math.floor(lastPrice / 50) * 50
      : FALLBACK_ANCHOR[family];
    setSeededFor(seedKey);
    setPriceText(money(anchor));
    setTpText(money(anchor + tpTicks * spec.tick));
    setSlText(money(anchor - slTicks * spec.tick));
    setMessage(null);
  }

  const price = useMemo(() => {
    const parsed = Number(priceText.replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : last;
  }, [priceText, last]);

  const effectivePrice = orderType === "market" ? last : price;
  const margin = units * spec.margin;
  const tickValue = units * spec.tickValue;
  const tradeValue = margin * LEVERAGE;
  const reward = tpOn ? tpTicks * tickValue : 0;
  const risk = slOn ? slTicks * tickValue : 0;
  const askOffsetTicks = Math.round((ask - effectivePrice) / spec.tick);

  const buttonLabel = `${side === "buy" ? "Buy" : "Sell"} ${units} ${
    spec.symbol
  } @ ${
    orderType === "market" ? "MARKET" : `${money(effectivePrice)} ${orderType.toUpperCase()}`
  }`;

  async function submit() {
    if (submitting || accounts.length === 0) {
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const result = await onSubmit({
      side,
      quantity: units,
      orderType,
      price: effectivePrice,
      accounts,
      stopLossTicks: slOn ? slTicks : null,
      takeProfitTicks: tpOn ? tpTicks : null,
    });
    setSubmitting(false);
    setMessage(result);
  }

  const label = (text: string) => (
    <p className="mb-1.5 text-[10px] font-medium text-ink-2">
      {text}
    </p>
  );

  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-l border-line bg-panel">
      <div data-boot-content className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="v-serif flex items-center gap-2 text-[16px] leading-none text-ink">
          <ArrowUpFromLine size={13} className="text-ink-2" />
          Trading Panel
        </span>
        <button
          onClick={onClose}
          aria-label="Collapse trading panel"
          className="v-press rounded-md p-1 text-ink-2 hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>

      <div data-boot-content className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 rounded-lg border border-line bg-card-soft p-0.5">
          {(["mini", "micro"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChangeSize(mode)}
              className={cn(
                "v-press h-7 rounded-[7px] text-[10px] font-medium capitalize",
                size === mode
                  ? "bg-chip text-chip-ink shadow-sm"
                  : "text-ink-2",
              )}
              style={size === mode ? { boxShadow: "var(--glow)" } : undefined}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="mt-2.5">
          <Dropdown
            label={
              <span className="font-mono text-[11px] font-semibold">
                {spec.symbol} · {EXCHANGES[family]}
              </span>
            }
            className="h-9 w-full justify-between px-3"
            menuClassName="w-full"
          >
            {(close) =>
              (["NQ", "YM", "GC"] as const).map((item) => (
                <MenuItem
                  key={item}
                  active={family === item}
                  onSelect={() => {
                    onChangeFamily(item);
                    close();
                  }}
                >
                  <span>{FAMILY_LABELS[item]}</span>
                  <span className="font-mono text-[9px] text-ink-3">
                    {SPECS[item][size].symbol} · {EXCHANGES[item]}
                  </span>
                </MenuItem>
              ))
            }
          </Dropdown>
        </div>

        <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-lg border border-line bg-card">
          <button
            onClick={() => setSide("sell")}
            className={cn(
              "v-press m-1 rounded-md px-2 py-1.5 text-left",
              side === "sell"
                ? "bg-ink text-bg"
                : "text-ink-2 hover:bg-card-soft",
            )}
          >
            <span className="block text-[9px] opacity-80">Sell</span>
            <span className="block font-mono text-[12px] font-semibold tabular-nums">
              {money(bid)}
            </span>
          </button>
          <div className="grid place-items-center">
            <span className="rounded bg-card-soft px-1.5 py-0.5 font-mono text-[8px] text-ink-2">
              {(spec.tick * 2).toFixed(2)}
            </span>
          </div>
          <button
            onClick={() => setSide("buy")}
            className={cn(
              "v-press m-1 rounded-md px-2 py-1.5 text-right",
              side === "buy"
                ? "bg-up-soft text-up"
                : "text-ink-2 hover:bg-card-soft",
            )}
          >
            <span className="block text-[9px] opacity-80">Buy</span>
            <span className="block font-mono text-[12px] font-semibold tabular-nums">
              {money(ask)}
            </span>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 border-b border-line">
          {(["market", "limit", "stop"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setOrderType(mode)}
              className={cn(
                "v-press relative pb-2 pt-1 text-[11px] capitalize",
                orderType === mode
                  ? "font-semibold text-ink"
                  : "text-ink-3",
              )}
            >
              {mode}
              {orderType === mode ? (
                <span className="absolute inset-x-4 -bottom-px h-[2px] rounded-full bg-ink" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-3">
          {label("Price")}
          <PriceField
            value={orderType === "market" ? "Market" : priceText}
            disabled={orderType === "market"}
            onChange={setPriceText}
            onSwap={() => setPriceText(money(ask))}
            right={
              orderType === "market"
                ? undefined
                : `Ask ${askOffsetTicks >= 0 ? "+" : ""}${askOffsetTicks}`
            }
          />
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1">
            <p className="text-[10px] font-medium text-ink-2">
              Units / Contracts
            </p>
            <ChevronDown size={11} className="text-ink-3" />
          </div>
          <div className="flex h-9 items-center overflow-hidden rounded-lg border border-line bg-card">
            <button
              onClick={() => setUnits((current) => Math.max(1, current - 1))}
              className="v-press h-full w-8 text-ink-2 hover:bg-card-soft"
            >
              -
            </button>
            <span className="flex-1 text-center font-mono text-[11px] tabular-nums">
              {units}
            </span>
            <button
              onClick={() => setUnits((current) => Math.min(50, current + 1))}
              className="v-press h-full w-8 text-ink-2 hover:bg-card-soft"
            >
              +
            </button>
            <span className="whitespace-nowrap border-l border-line px-3 font-mono text-[9px] text-ink-3">
              {money(margin)} USD
            </span>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-medium text-ink-2">
              Take Profit
            </p>
            <Switch checked={tpOn} onChange={setTpOn} label="Take profit" />
          </div>
          <div className="grid grid-cols-[1fr_88px] gap-1.5">
            <PriceField
              value={tpText}
              disabled={!tpOn}
              onChange={setTpText}
              onSwap={() =>
                setTpText(money(effectivePrice + tpTicks * spec.tick))
              }
            />
            <Dropdown
              label={
                <span className="whitespace-nowrap font-mono text-[10px]">{tpTicks} ticks</span>
              }
              className={cn("h-9 justify-between px-2.5", !tpOn && "opacity-55")}
              align="right"
            >
              {(close) =>
                TICK_CHOICES.map((ticks) => (
                  <MenuItem
                    key={ticks}
                    active={tpTicks === ticks}
                    onSelect={() => {
                      setTpTicks(ticks);
                      setTpText(money(effectivePrice + ticks * spec.tick));
                      close();
                    }}
                  >
                    <span className="font-mono">{ticks} ticks</span>
                  </MenuItem>
                ))
              }
            </Dropdown>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-medium text-ink-2">
              Stop Loss
            </p>
            <Switch checked={slOn} onChange={setSlOn} label="Stop loss" />
          </div>
          <div className="grid grid-cols-[1fr_88px] gap-1.5">
            <PriceField
              value={slText}
              disabled={!slOn}
              onChange={setSlText}
              onSwap={() =>
                setSlText(money(effectivePrice - slTicks * spec.tick))
              }
            />
            <Dropdown
              label={
                <span className="whitespace-nowrap font-mono text-[10px]">{slTicks} ticks</span>
              }
              className={cn("h-9 justify-between px-2.5", !slOn && "opacity-55")}
              align="right"
            >
              {(close) =>
                TICK_CHOICES.map((ticks) => (
                  <MenuItem
                    key={ticks}
                    active={slTicks === ticks}
                    onSelect={() => {
                      setSlTicks(ticks);
                      setSlText(money(effectivePrice - ticks * spec.tick));
                      close();
                    }}
                  >
                    <span className="font-mono">{ticks} ticks</span>
                  </MenuItem>
                ))
              }
            </Dropdown>
          </div>
        </div>

        {levels.map((level) => (
          <div key={level.id} className="mt-2 flex items-center gap-1.5">
            <PriceField
              value={level.text}
              onChange={(text) =>
                setLevels((current) =>
                  current.map((item) =>
                    item.id === level.id ? { ...item, text } : item,
                  ),
                )
              }
            />
            <button
              onClick={() =>
                setLevels((current) =>
                  current.filter((item) => item.id !== level.id),
                )
              }
              aria-label="Remove level"
              className="v-press p-1 text-ink-3 hover:text-down"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        <button
          onClick={() =>
            setLevels((current) => [
              ...current,
              {
                id: Date.now(),
                text: money(effectivePrice + (current.length + 2) * 50),
              },
            ])
          }
          className="v-press mt-2.5 flex items-center gap-1.5 text-[10px] font-medium text-ink-2 hover:text-ink"
        >
          <Plus size={11} />
          Add level
        </button>

        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-medium text-ink-2">
              Order Info
              <Info size={10} className="text-ink-3" />
            </span>
            <span className="text-ink-3">~</span>
          </div>

          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-ink-2">Margin</span>
              <span className="font-mono tabular-nums text-ink">
                {money(margin)} / {money(BUYING_POWER)}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-up transition-all"
                style={{
                  width: `${Math.min(100, (margin / BUYING_POWER) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5 text-[9px]">
            {(
              [
                ["Leverage", `${LEVERAGE}:1`, undefined],
                ["Tick Value", `${money(tickValue)} USD`, undefined],
                ["Trade Value", `${money(tradeValue)} USD`, undefined],
                [
                  "Reward",
                  tpOn
                    ? `${((reward / BUYING_POWER) * 100).toFixed(2)}% / ${money(reward)} USD`
                    : "--",
                  "up",
                ],
                [
                  "Risk",
                  slOn
                    ? `${((risk / BUYING_POWER) * 100).toFixed(2)}% / ${money(risk)} USD`
                    : "--",
                  "down",
                ],
              ] as const
            ).map(([rowLabel, value, tone]) => (
              <div key={rowLabel} className="flex items-center justify-between">
                <span className="text-ink-2">{rowLabel}</span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    tone === "up" && "text-up",
                    tone === "down" && "text-down",
                    !tone && "text-ink",
                  )}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <span className="flex items-center gap-1 text-[10px] font-medium text-ink-2">
            Prop Accounts
            <Info size={10} className="text-ink-3" />
          </span>
          <div className="mt-2">
            <Dropdown
              label={
                <span className="text-[10px]">
                  {accounts.length} Account{accounts.length === 1 ? "" : "s"}{" "}
                  Selected
                </span>
              }
              className="h-9 w-full justify-between px-3"
              menuClassName="w-full"
            >
              {() =>
                ACCOUNTS.map((account) => (
                  <MenuItem
                    key={account}
                    active={accounts.includes(account)}
                    onSelect={() =>
                      setAccounts((current) =>
                        current.includes(account)
                          ? current.filter((item) => item !== account)
                          : [...current, account],
                      )
                    }
                  >
                    <span>{account}</span>
                    {accounts.includes(account) ? <span>✓</span> : null}
                  </MenuItem>
                ))
              }
            </Dropdown>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {accounts.map((account) => (
              <button
                key={account}
                onClick={() =>
                  setAccounts((current) =>
                    current.filter((item) => item !== account),
                  )
                }
                title="Remove account"
                className="v-press flex items-center gap-1 rounded-md bg-card-soft px-2 py-1 text-[8px] text-ink-2"
              >
                {account}
                <Info size={9} className="text-ink-3" />
              </button>
            ))}
          </div>
        </div>

        <button
          data-boot-buy
          onClick={submit}
          disabled={submitting || accounts.length === 0}
          className={cn(
            "v-press mt-4 h-11 w-full rounded-lg font-mono text-[11px] font-semibold tracking-[-0.01em] disabled:cursor-not-allowed disabled:opacity-40",
            side === "buy"
              ? "bg-chip text-chip-ink"
              : "bg-down text-white",
          )}
          style={{ boxShadow: "var(--glow)" }}
        >
          {submitting ? "Routing..." : buttonLabel}
        </button>

        {message ? (
          <div className="v-pop-in mt-2.5 rounded-lg border border-line bg-up-soft px-3 py-2 text-[9px] leading-4 text-up">
            {message}
          </div>
        ) : null}
      </div>

      <div data-boot-content className="flex items-center gap-2 border-t border-line px-4 py-3 text-[9px]">
        <span
          data-boot-dot
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            session.open ? "bg-up" : "bg-down",
          )}
        />
        <span className="font-medium text-ink">Market</span>
        <span className="text-ink-3">|</span>
        <span className="text-ink-2">{session.name}</span>
        <span className="text-ink-3">|</span>
        <span className={cn("font-medium", session.open ? "text-up" : "text-down")}>
          {session.open ? "Open" : "Closed"}
        </span>
      </div>
    </aside>
  );
}
