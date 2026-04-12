import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  id = "search-input",
  value,
  onChange,
  onClear,
  placeholder = "Search…",
  className,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Label htmlFor={id} className="sr-only">
        {placeholder}
      </Label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border-border/60 bg-background pl-8 pr-8 text-sm placeholder:text-muted-foreground/60"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-sm text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
          <span className="sr-only">Clear</span>
        </Button>
      )}
    </div>
  );
}
