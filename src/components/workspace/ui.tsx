"use client";

import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export function Sparkline({
  data,
  color,
  width = 84,
  height = 30,
  className,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(
          height -
          2 -
          ((value - min) / span) * (height - 4)
        ).toFixed(1)}`,
    )
    .join(" L");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d={`M${points}`}
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Dropdown({
  label,
  className,
  menuClassName,
  align = "left",
  hideChevron = false,
  children,
}: {
  label: ReactNode;
  className?: string;
  menuClassName?: string;
  align?: "left" | "right";
  hideChevron?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "v-press flex items-center gap-2 rounded-xl border border-line bg-card text-[12px] text-ink",
          className,
        )}
      >
        {label}
        {hideChevron ? null : (
          <ChevronDown
            size={13}
            className={cn(
              "text-ink-2 transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>
      {open ? (
        <div
          className={cn(
            "v-pop-in absolute z-40 mt-2 min-w-full overflow-hidden rounded-xl border border-line bg-card p-1 shadow-[0_18px_50px_rgba(0,0,0,0.14)]",
            align === "right" ? "right-0" : "left-0",
            menuClassName,
          )}
          style={{ boxShadow: "var(--glow), 0 18px 50px rgba(0,0,0,0.18)" }}
        >
          {typeof children === "function"
            ? children(() => setOpen(false))
            : children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  active = false,
  disabled = false,
  onSelect,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onSelect}
      style={active && !disabled ? { boxShadow: "var(--glow)" } : undefined}
      className={cn(
        "flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[11px] transition",
        active
          ? "bg-chip font-medium text-chip-ink"
          : "text-ink hover:bg-card-soft",
        disabled && "cursor-not-allowed text-ink-3 hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
        checked ? "bg-up" : "bg-line",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all",
          checked ? "left-[16px]" : "left-[2px]",
        )}
      />
    </button>
  );
}
