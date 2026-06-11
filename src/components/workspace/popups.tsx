"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Info,
  MoreVertical,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

function money(value: number, decimals = 2) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function PopupShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className="v-pop-in absolute left-4 top-4 z-30 flex max-h-[calc(100%-2rem)] w-[400px] flex-col overflow-hidden rounded-xl border border-line bg-card"
      style={{ boxShadow: "var(--glow), 0 28px 70px rgba(0,0,0,0.22)" }}
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        <button
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="v-press rounded-md p-1 text-ink-2 hover:text-ink"
        >
          <X size={14} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </div>
  );
}

function StatTriple({
  stats,
}: {
  stats: [string, string, "up" | "down" | undefined][];
}) {
  return (
    <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
      {stats.map(([label, value, tone]) => (
        <div key={label} className="px-4 py-3">
          <p className="text-[8px] text-ink-3">{label}</p>
          <p
            className={cn(
              "mt-1 font-mono text-[13px] font-semibold tabular-nums",
              tone === "up" && "text-up",
              tone === "down" && "text-down",
            )}
          >
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function SideChip({ side }: { side: "Buy" | "Sell" }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[8px] font-semibold",
        side === "Buy"
          ? "bg-up-soft text-up"
          : "bg-down-soft text-down",
      )}
    >
      {side}
    </span>
  );
}

function FooterLink({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="v-press flex w-full items-center justify-between border-t border-line px-4 py-3 text-[10px] font-medium text-ink hover:bg-card-soft"
    >
      {label}
      <ChevronRight size={13} className="text-ink-2" />
    </button>
  );
}

/* ------------------------------------------------------------------ */

export function PositionsPopup({
  nqMark,
  onClose,
}: {
  nqMark: number | null;
  onClose: () => void;
}) {
  const mark = nqMark ?? 19164.75;
  // Demo position rides 10.5 pts in profit against the live mark.
  const entry = mark - 10.5;
  const nqPnl = (mark - entry) * 20 * 4;
  const total = nqPnl + 284 + -45.5;

  const positions = [
    {
      symbol: "NQ1! · CME",
      name: "E-mini Nasdaq 100",
      side: "Buy" as const,
      qty: 4,
      entry: money(entry),
      markPrice: money(mark),
      pnl: nqPnl,
    },
    {
      symbol: "YM1! · CBOT",
      name: "E-mini Dow ($5)",
      side: "Buy" as const,
      qty: 2,
      entry: "38,500.00",
      markPrice: "38,642.00",
      pnl: 284,
    },
    {
      symbol: "GC1! · COMEX",
      name: "Gold Futures",
      side: "Sell" as const,
      qty: 1,
      entry: "2,345.00",
      markPrice: "2,340.45",
      pnl: -45.5,
    },
  ];

  return (
    <PopupShell
      title="Open Positions"
      onClose={onClose}
      footer={<FooterLink label="View All Positions" />}
    >
      <StatTriple
        stats={[
          ["Total Open P&L", `$${money(total)}`, "up"],
          ["Open Positions", "3", undefined],
          ["Net Exposure", "115,620.00 USD", undefined],
        ]}
      />

      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <button className="v-press flex items-center gap-1 text-[9px] text-ink-2 hover:text-ink">
          Instrument
          <ChevronDown size={10} />
        </button>
        <span className="text-[9px] text-ink-3">Actions</span>
      </div>

      <div className="space-y-2.5 p-3">
        {positions.map((position) => (
          <article
            key={position.symbol}
            className="rounded-lg border border-line bg-card p-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    position.pnl >= 0 ? "bg-up" : "bg-down",
                  )}
                />
                <div>
                  <p className="font-mono text-[10px] font-semibold">
                    {position.symbol}
                  </p>
                  <p className="mt-0.5 text-[8px] text-ink-3">
                    {position.name}
                  </p>
                </div>
              </div>
              <button
                aria-label={`Actions for ${position.symbol}`}
                className="v-press p-1 text-ink-3 hover:text-ink"
              >
                <MoreVertical size={12} />
              </button>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 border-b border-line-soft pb-2.5 text-[9px]">
              <div>
                <p className="text-ink-3">Side</p>
                <p className="mt-1">
                  <SideChip side={position.side} />
                </p>
              </div>
              <div>
                <p className="text-ink-3">Qty / Contracts</p>
                <p className="mt-1 font-mono">{position.qty}</p>
              </div>
              <div>
                <p className="text-ink-3">Status</p>
                <p className="mt-1 font-medium text-up">Open</p>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-[9px]">
              <div>
                <p className="text-ink-3">Entry Price</p>
                <p className="mt-1 font-mono tabular-nums">{position.entry}</p>
              </div>
              <div>
                <p className="text-ink-3">Mark Price</p>
                <p className="mt-1 font-mono tabular-nums">
                  {position.markPrice}
                </p>
              </div>
              <div>
                <p className="text-ink-3">Unrealized P&L</p>
                <p
                  className={cn(
                    "mt-1 font-mono tabular-nums",
                    position.pnl >= 0
                      ? "text-up"
                      : "text-down",
                  )}
                >
                  {position.pnl >= 0 ? "+" : "-"}
                  {money(Math.abs(position.pnl))} USD
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </PopupShell>
  );
}

/* ------------------------------------------------------------------ */

const JOURNAL_ENTRIES = [
  {
    symbol: "NQ1! · CME",
    name: "E-mini Nasdaq 100",
    side: "Buy" as const,
    qty: 4,
    opened: "09:42",
    closed: "10:18",
    entry: "19,080.00",
    exit: "19,132.25",
    pnl: "+$418.00",
    positive: true,
    range: "day",
  },
  {
    symbol: "YM1! · CBOT",
    name: "E-mini Dow ($5)",
    side: "Sell" as const,
    qty: 2,
    opened: "11:05",
    closed: "11:44",
    entry: "38,710.00",
    exit: "38,642.00",
    pnl: "+$340.00",
    positive: true,
    range: "hour",
  },
  {
    symbol: "GC1! · COMEX",
    name: "Gold Futures",
    side: "Buy" as const,
    qty: 1,
    opened: "Yesterday 14:08",
    closed: "Yesterday 15:02",
    entry: "2,328.40",
    exit: "2,321.10",
    pnl: "-$73.00",
    positive: false,
    range: "3d",
  },
  {
    symbol: "ES1! · CME",
    name: "E-mini S&P 500",
    side: "Buy" as const,
    qty: 3,
    opened: "05:58",
    closed: "09:30",
    entry: "5,310.50",
    exit: "5,324.75",
    pnl: "+$213.75",
    positive: true,
    range: "day",
  },
];

const RANGES = ["Hour", "Day", "3D", "Week", "Month"] as const;

export function JournalPopup({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("Day");

  const visible = JOURNAL_ENTRIES.filter((entry) => {
    if (range === "Hour") {
      return entry.range === "hour";
    }
    if (range === "Day") {
      return entry.range === "hour" || entry.range === "day";
    }
    return true;
  });

  return (
    <PopupShell
      title="Trade Journal"
      onClose={onClose}
      footer={<FooterLink label="View Full Journal" />}
    >
      <StatTriple
        stats={[
          ["Realized P&L", "$2,485.75", "up"],
          ["Trades", "18", undefined],
          ["Win Rate", "66.7%", undefined],
        ]}
      />

      <div className="border-b border-line px-3 py-2">
        <div className="grid grid-cols-5 rounded-lg border border-line bg-card-soft p-0.5">
          {RANGES.map((item) => (
            <button
              key={item}
              onClick={() => setRange(item)}
              className={cn(
                "v-press h-6 rounded-[6px] text-[9px] font-medium",
                range === item
                  ? "bg-chip text-chip-ink shadow-sm"
                  : "text-ink-2",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        {visible.map((entry) => (
          <article
            key={entry.symbol}
            className="rounded-lg border border-line bg-card p-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    entry.positive ? "bg-up" : "bg-down",
                  )}
                />
                <div>
                  <p className="font-mono text-[10px] font-semibold">
                    {entry.symbol}
                  </p>
                  <p className="mt-0.5 text-[8px] text-ink-3">
                    {entry.name}
                  </p>
                </div>
              </div>
              <SideChip side={entry.side} />
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-2 border-b border-line-soft pb-2.5 text-[9px]">
              <div>
                <p className="text-ink-3">Qty / Contracts</p>
                <p className="mt-1 font-mono">{entry.qty}</p>
              </div>
              <div>
                <p className="text-ink-3">Opened</p>
                <p className="mt-1 font-mono">{entry.opened}</p>
              </div>
              <div>
                <p className="text-ink-3">Closed</p>
                <p className="mt-1 font-mono">{entry.closed}</p>
              </div>
              <div>
                <p className="text-ink-3">Status</p>
                <p className="mt-1">
                  <span className="rounded bg-card-soft px-1.5 py-0.5 font-mono text-[8px] text-ink-2">
                    Closed
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-3 gap-2 text-[9px]">
              <div>
                <p className="text-ink-3">Entry Price</p>
                <p className="mt-1 font-mono tabular-nums">{entry.entry}</p>
              </div>
              <div>
                <p className="text-ink-3">Exit Price</p>
                <p className="mt-1 font-mono tabular-nums">{entry.exit}</p>
              </div>
              <div>
                <p className="text-ink-3">Realized P&L</p>
                <p
                  className={cn(
                    "mt-1 font-mono tabular-nums",
                    entry.positive ? "text-up" : "text-down",
                  )}
                >
                  {entry.pnl}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </PopupShell>
  );
}

/* ------------------------------------------------------------------ */

function Donut({ value, color }: { value: number; color: string }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="var(--line)"
        strokeWidth="4"
      />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(circumference * value) / 100} ${circumference}`}
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

export function AnalyticsPopup({ onClose }: { onClose: () => void }) {
  const cells: [string, string, "up" | "down" | undefined][] = [
    ["Total Net P&L", "$2,485.75", "up"],
    ["Win Rate", "66.7%", undefined],
    ["Profit Factor", "1.84", undefined],
    ["Avg Win", "+$256.40", "up"],
    ["Avg Loss", "-$142.75", "down"],
    ["Expectancy", "+$138.10 / trade", "up"],
    ["Avg Hold Time", "34 min", undefined],
    ["Best Trade", "+$418.00", "up"],
    ["Worst Trade", "-$73.00", "down"],
  ];

  return (
    <PopupShell title="Trade Analytics" onClose={onClose}>
      <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
        {cells.map(([label, value, tone]) => (
          <div key={label} className="bg-card px-3.5 py-3">
            <p className="text-[8px] text-ink-3">{label}</p>
            <p
              className={cn(
                "mt-1 font-mono text-[12px] font-semibold tabular-nums",
                tone === "up" && "text-up",
                tone === "down" && "text-down",
              )}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-[8px] text-ink-3">Total Trades</p>
          <p className="mt-0.5 font-mono text-[13px] font-semibold">18</p>
        </div>
        <div className="flex-1">
          <p className="mb-1.5 text-right text-[8px] text-ink-2">
            61% Long / 39% Short
          </p>
          <div className="flex h-1.5 overflow-hidden rounded-full">
            <span className="w-[61%] bg-up" />
            <span className="flex-1 bg-line" />
          </div>
        </div>
      </div>

      <div className="border-b border-line px-4 py-3">
        <p className="flex items-center gap-1 text-[10px] font-medium">
          Performance Breakdown
          <Info size={10} className="text-ink-3" />
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {(
            [
              ["Best Instrument", "NQ1!", "+$1,124.50", "up"],
              ["Most Traded", "NQ1!", "7 trades", undefined],
              ["Best Session", "NY Open", "+$1,486.25", "up"],
              ["Avg R/R Achieved", "1.87", "", undefined],
            ] as const
          ).map(([label, value, sub, tone]) => (
            <div
              key={label}
              className="rounded-lg border border-line bg-card-soft px-3 py-2.5"
            >
              <p className="text-[8px] text-ink-3">{label}</p>
              <p className="mt-1 font-mono text-[11px] font-semibold">
                {value}
              </p>
              {sub ? (
                <p
                  className={cn(
                    "mt-0.5 font-mono text-[9px]",
                    tone === "up" ? "text-up" : "text-ink-2",
                  )}
                >
                  {sub}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-line px-4 py-3">
        <p className="text-[10px] font-medium">Directional Edge</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {(
            [
              ["Long Trades", "11 trades", 72.7, "+$1,642.25", "var(--up)"],
              ["Short Trades", "7 trades", 57.1, "+$843.50", "var(--down)"],
            ] as const
          ).map(([label, count, winRate, pnl, color]) => (
            <div
              key={label}
              className="rounded-lg border border-line bg-card-soft px-3 py-2.5"
            >
              <p className="flex items-center gap-1.5 text-[9px] font-medium">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color }}
                />
                {label}
              </p>
              <p className="mt-0.5 text-[8px] text-ink-3">{count}</p>
              <div className="mt-2 flex items-center gap-2">
                <Donut value={winRate} color={color} />
                <div>
                  <p className="font-mono text-[11px] font-semibold">
                    {winRate}%
                  </p>
                  <p className="text-[7px] text-ink-3">Win Rate</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px]">
                <span className="text-ink-3">P&L</span>
                <span className="font-mono font-semibold text-up">
                  {pnl}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-[10px] font-medium">Execution Insights</p>
        <div className="mt-2 space-y-1.5 pb-1">
          {(
            [
              [
                TrendingUp,
                "Highest profitability comes from NQ trades held 20 to 45 minutes",
              ],
              [Zap, "Win rate improves during NY open session"],
              [
                ArrowDownRight,
                "Short setups show lower consistency but positive expectancy",
              ],
            ] as const
          ).map(([Icon, text]) => (
            <button
              key={text}
              className="v-press flex w-full items-center gap-2.5 rounded-lg border border-line bg-card-soft px-3 py-2.5 text-left hover:bg-card"
            >
              <Icon size={12} className="shrink-0 text-up" />
              <span className="flex-1 text-[9px] leading-4 text-ink-2">
                {text}
              </span>
              <ArrowRight size={11} className="shrink-0 text-ink-3" />
            </button>
          ))}
        </div>
      </div>
    </PopupShell>
  );
}
