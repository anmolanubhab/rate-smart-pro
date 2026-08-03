import { cn } from "@/lib/utils";

const SIZES = { sm: "h-5 w-5", md: "h-6 w-6", lg: "h-7 w-7" } as const;
const RING = "conic-gradient(from 0deg in oklch, hsl(var(--primary)), hsl(262 70% 65%), hsl(330 65% 65%), hsl(38 80% 60%), hsl(160 60% 45%), hsl(217 75% 60%), hsl(var(--primary)))";
const MASK = "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))";

interface LoadingSpinnerProps {
  size?: keyof typeof SIZES;
  color?: string;
  className?: string;
}

export function LoadingSpinner({ size = "md", color, className }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("inline-block animate-spin rounded-full", SIZES[size], className)}
      style={{
        background: color ?? RING,
        WebkitMask: MASK,
        mask: MASK,
        filter: `drop-shadow(0 0 3px ${color ?? "hsl(var(--primary) / .35)"})`,
        animationDuration: "1.2s",
        willChange: "transform",
      }}
    />
  );
}
