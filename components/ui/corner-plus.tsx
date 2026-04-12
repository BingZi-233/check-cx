import { cn } from "@/lib/utils";

interface CornerPlusProps {
  className?: string;
}

/** Tech-style decorative corner plus marker */
export function CornerPlus({ className }: CornerPlusProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className={cn("absolute h-4 w-4 text-muted-foreground/40", className)}
      aria-hidden="true"
    >
      <line x1="12" y1="0" x2="12" y2="24" />
      <line x1="0" y1="12" x2="24" y2="12" />
    </svg>
  );
}
