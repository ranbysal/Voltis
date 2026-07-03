export const TIMEFRAMES = [
  "5m",
  "10m",
  "30m",
  "1h",
  "4h",
  "1d",
  "3d",
  "1w",
  "1M",
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];
export type SymbolFamily = "YM" | "NQ" | "GC";
export type ExecutionSize = "mini" | "micro";
export type FibDirection = "buy" | "sell";

/** Human-friendly instrument names shown in the selector dropdowns. */
export const FAMILY_LABELS: Record<SymbolFamily, string> = {
  NQ: "Nasdaq (NQ)",
  YM: "Dow Jones (YM)",
  GC: "Gold (GC)",
};

export type MarketBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FibAnchor = {
  time: number;
  price: number;
};

export type FibDrawing = {
  id: string;
  family: SymbolFamily;
  timeframe: Timeframe;
  direction: FibDirection;
  start: FibAnchor;
  end: FibAnchor;
  visible: boolean;
  locked: boolean;
  manual: boolean;
  updatedAt: string;
};

/** A hand-drawn chart annotation: a trend line or a text label. */
export type ChartDrawing = {
  id: string;
  family: SymbolFamily;
  kind: "trend" | "text";
  start: FibAnchor;
  /** Second anchor — trend lines only. */
  end: FibAnchor | null;
  /** Label content — text annotations only. */
  text: string | null;
  updatedAt: string;
};

export type WorkspaceState = {
  family: SymbolFamily;
  executionSize: ExecutionSize;
  timeframe: Timeframe;
  fibs: FibDrawing[];
  drawings: ChartDrawing[];
  quantity: number;
  stopLoss: number;
  takeProfit: number;
};

export type OrderIntent = {
  ticker: string;
  action: "buy" | "sell" | "exit" | "cancel";
  quantity: number;
  targets: string[];
  orderType: "market";
  signalPrice: number;
  stopLossPoints?: number;
  takeProfitPoints?: number;
  time: string;
  test: boolean;
  idempotencyKey: string;
};

export const FIB_LEVELS = [0, 0.382, 0.786, 1] as const;

export const DEFAULT_WORKSPACE: WorkspaceState = {
  family: "NQ",
  executionSize: "mini",
  timeframe: "30m",
  fibs: [],
  drawings: [],
  quantity: 2,
  stopLoss: 40,
  takeProfit: 80,
};

export function executionTicker(
  family: SymbolFamily,
  size: ExecutionSize,
): "YM" | "MYM" | "NQ" | "MNQ" | "GC" | "MGC" {
  if (family === "YM") {
    return size === "mini" ? "YM" : "MYM";
  }

  if (family === "GC") {
    return size === "mini" ? "GC" : "MGC";
  }

  return size === "mini" ? "NQ" : "MNQ";
}

export function fibPrice(fib: FibDrawing, level: number) {
  return fib.end.price + level * (fib.start.price - fib.end.price);
}
