import { cn } from "@/lib/utils";

interface PillToggleOption<T extends string> {
  value: T;
  label: string;
}

interface PillToggleProps<T extends string> {
  label: string;
  options: PillToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function PillToggle<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: PillToggleProps<T>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
    >
      <span className="pl-1">{label}</span>
      <div className="flex items-center gap-1 rounded-full bg-muted/30 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-2 py-1 text-2xs font-semibold uppercase tracking-wider transition-colors",
              value === option.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
