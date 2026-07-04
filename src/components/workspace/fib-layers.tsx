"use client";

import { Eye, EyeOff, Lock, RefreshCw, Trash2, Unlock, Upload, X } from "lucide-react";
import { useState } from "react";
import {
  TIMEFRAMES,
  type FibDirection,
  type FibDrawing,
  type SymbolFamily,
  type Timeframe,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export function FibLayersPanel({
  family,
  fibs,
  selectedId,
  onSelect,
  onCreate,
  onToggleVisible,
  onToggleLock,
  onRefresh,
  onRefreshAll,
  onDelete,
  onExport,
  onClose,
}: {
  family: SymbolFamily;
  fibs: FibDrawing[];
  selectedId: string | null;
  onSelect: (fib: FibDrawing) => void;
  onCreate: (timeframe: Timeframe, direction: FibDirection) => void;
  onToggleVisible: (fib: FibDrawing) => void;
  onToggleLock: (fib: FibDrawing) => void;
  onRefresh: (fib: FibDrawing) => void;
  onRefreshAll: (direction: FibDirection) => void;
  onDelete: (fib: FibDrawing) => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<FibDirection>("buy");

  return (
    <aside className="flex w-[176px] shrink-0 flex-col border-l border-line bg-panel">
      <div data-boot-content className="flex items-center justify-between px-3.5 pb-2 pt-4">
        <span className="v-serif text-[16px] leading-none text-ink">
          Fib Layers
        </span>
        <button
          onClick={onClose}
          aria-label="Collapse fib layers"
          className="v-press rounded-md p-1 text-ink-2 hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>

      <div data-boot-content className="mx-3 grid grid-cols-2 rounded-lg border border-line bg-card-soft p-0.5">
        {(["buy", "sell"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setDirection(mode)}
            className={cn(
              "v-press h-7 rounded-[7px] text-[10px] font-medium",
              direction === mode
                ? mode === "buy"
                  ? "bg-card text-up shadow-sm"
                  : "bg-card text-down shadow-sm"
                : "text-ink-2",
            )}
          >
            {mode === "buy" ? "Buy Fib" : "Sell Fib"}
          </button>
        ))}
      </div>

      <div data-boot-content className="flex items-center justify-between px-3.5 pb-1 pt-3">
        <span className="text-[9px] text-ink-3">
          Visible Overlays
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onExport}
            aria-label="Export fib layers"
            title="Copy fib layers to clipboard"
            className="v-press rounded p-0.5 text-ink-2 hover:text-ink"
          >
            <Upload size={11} />
          </button>
          <button
            onClick={() => onRefreshAll(direction)}
            aria-label="Refresh all fib layers"
            title="Re-detect all unlocked layers"
            className="v-press rounded p-0.5 text-ink-2 hover:text-ink"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      <div data-boot-content className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {TIMEFRAMES.map((timeframe) => {
          const fib = fibs.find(
            (item) =>
              item.family === family &&
              item.timeframe === timeframe &&
              item.direction === direction,
          );
          const visible = fib?.visible ?? false;
          const selected = fib !== undefined && fib.id === selectedId;

          return (
            <div
              key={timeframe}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border py-2 pl-2.5 pr-1.5",
                selected
                  ? "border-[#4b8ee8] bg-card-soft"
                  : "border-line bg-card",
              )}
            >
              <button
                onClick={() =>
                  fib ? onToggleVisible(fib) : onCreate(timeframe, direction)
                }
                aria-label={`Toggle ${timeframe} ${direction} fib`}
                className={cn(
                  "v-press",
                  visible ? "text-up" : "text-ink-3",
                )}
              >
                {visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                onClick={() =>
                  fib ? onSelect(fib) : onCreate(timeframe, direction)
                }
                aria-label={`Show ${timeframe} ${direction} fib on the chart`}
                title={
                  fib
                    ? selected
                      ? "Deselect"
                      : "Highlight this fib on the chart"
                    : "Create this fib"
                }
                className={cn(
                  "v-press min-w-0 flex-1 text-left text-[10px] font-medium",
                  selected ? "text-[#4b8ee8]" : "text-ink",
                )}
              >
                {timeframe}
              </button>
              <button
                disabled={!fib}
                onClick={() => fib && onToggleLock(fib)}
                aria-label={`Lock ${timeframe} fib`}
                className={cn(
                  "v-press p-0.5",
                  fib?.locked
                    ? "text-ink"
                    : "text-ink-3 hover:text-ink",
                  !fib && "opacity-35",
                )}
              >
                {fib?.locked ? <Lock size={11} /> : <Unlock size={11} />}
              </button>
              <button
                disabled={!fib}
                onClick={() => fib && onRefresh(fib)}
                aria-label={`Refresh ${timeframe} fib`}
                className={cn(
                  "v-press p-0.5 text-ink-3 hover:text-ink",
                  !fib && "opacity-35",
                )}
              >
                <RefreshCw size={11} />
              </button>
              <button
                disabled={!fib}
                onClick={() => fib && onDelete(fib)}
                aria-label={`Delete ${timeframe} fib`}
                className={cn(
                  "v-press p-0.5 text-ink-3 hover:text-down",
                  !fib && "opacity-35",
                )}
              >
                <Trash2 size={11} />
              </button>
            </div>
          );
        })}
      </div>

      <div data-boot-content className="border-t border-line px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[8px] text-ink-3">Buying Power</p>
            <p className="mt-0.5 font-mono text-[11px] font-medium tabular-nums">
              $48,750.00
            </p>
          </div>
          <div className="text-right">
            <p className="text-[8px] text-ink-3">Day Margin</p>
            <p className="mt-0.5 font-mono text-[11px] font-medium tabular-nums">
              $1,250.00
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
