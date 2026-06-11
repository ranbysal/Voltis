import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  inverse = false,
}: {
  className?: string;
  inverse?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative block h-9 w-9 shrink-0", className)}
    >
      <span
        className={cn(
          "absolute left-0.5 top-1.5 h-6 w-8 rotate-45 rounded-full border-2",
          inverse ? "border-white" : "border-black",
        )}
      />
      <span
        className={cn(
          "absolute left-0.5 top-1.5 h-6 w-8 -rotate-45 rounded-full border-2",
          inverse ? "border-white" : "border-black",
        )}
      />
    </span>
  );
}
