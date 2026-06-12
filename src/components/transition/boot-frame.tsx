"use client";

/**
 * Registration marks + hairline inset frame + corner brackets used by the
 * boot transition (Beats 2-3). Default markup is the fully drawn state;
 * the landing timeline pre-hides marks/strokes and animates them in, and
 * the dashboard mounts it already drawn so the frame survives the route
 * swap seamlessly.
 *
 * Geometry: 1px rectangle inset 20px from the viewport, drawn as eight
 * stroke segments that extend from the corners to the edge midpoints
 * (stroke-dashoffset), plus 14px L-brackets at each corner and 5px solid
 * square registration ticks at corners and edge midpoints.
 */

const MARKS: { left?: string; right?: string; top?: string; bottom?: string }[] =
  [
    { left: "9px", top: "9px" },
    { right: "9px", top: "9px" },
    { left: "9px", bottom: "9px" },
    { right: "9px", bottom: "9px" },
    { left: "50%", top: "9px" },
    { left: "50%", bottom: "9px" },
    { left: "9px", top: "50%" },
    { right: "9px", top: "50%" },
  ];

// segments: [x1, y1, x2, y2] in % of the inset box, drawn corner -> midpoint
const SEGMENTS: [string, string, string, string][] = [
  ["0%", "0%", "50%", "0%"],
  ["100%", "0%", "50%", "0%"],
  ["100%", "0%", "100%", "50%"],
  ["100%", "100%", "100%", "50%"],
  ["100%", "100%", "50%", "100%"],
  ["0%", "100%", "50%", "100%"],
  ["0%", "100%", "0%", "50%"],
  ["0%", "0%", "0%", "50%"],
];

const BRACKETS: { corner: string; d: string }[] = [
  { corner: "left-0 top-0", d: "M14 1 L1 1 L1 14" },
  { corner: "right-0 top-0", d: "M0 1 L13 1 L13 14" },
  { corner: "left-0 bottom-0", d: "M14 13 L1 13 L1 0" },
  { corner: "right-0 bottom-0", d: "M0 13 L13 13 L13 0" },
];

export function BootFrame({ id }: { id: string }) {
  return (
    <div
      id={id}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[80]"
    >
      {MARKS.map((pos, index) => (
        <span
          key={index}
          data-boot-mark
          className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 bg-[#161714]/60"
          style={{
            left: pos.left,
            right: pos.right,
            top: pos.top,
            bottom: pos.bottom,
            transform:
              pos.left === "50%" || pos.top === "50%"
                ? "translate(-50%, -50%)"
                : undefined,
          }}
        />
      ))}

      <div className="absolute inset-5">
        <svg className="h-full w-full overflow-visible">
          {SEGMENTS.map(([x1, y1, x2, y2], index) => (
            <line
              key={index}
              data-frame-seg
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              pathLength={1}
              stroke="#161714"
              strokeOpacity="0.22"
              strokeWidth="1"
            />
          ))}
        </svg>

        {BRACKETS.map(({ corner, d }) => (
          <svg
            key={corner}
            className={`absolute ${corner} h-[14px] w-[14px] overflow-visible`}
            viewBox="0 0 14 14"
          >
            <path
              data-frame-bracket
              d={d}
              pathLength={1}
              fill="none"
              stroke="#161714"
              strokeOpacity="0.45"
              strokeWidth="1.5"
            />
          </svg>
        ))}
      </div>

      <div
        data-boot-status
        className="absolute bottom-9 left-10 flex items-center font-mono text-[10px] tracking-[0.08em] text-[#161714]/45"
      >
        <span data-boot-status-text />
        <span data-boot-caret className="v-caret ml-0.5">
          ▌
        </span>
      </div>
    </div>
  );
}
