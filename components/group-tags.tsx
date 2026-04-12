"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getTagColorClass, parseTagList } from "@/lib/utils/tag-colors";

interface GroupTagsProps {
  tags?: string | null;
  className?: string;
}

export function GroupTags({ tags, className }: GroupTagsProps) {
  const items = parseTagList(tags);
  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((tag, i) => (
        <Badge
          key={`${tag}-${i}`}
          className={cn(
            "rounded px-1.5 py-0 text-2xs font-semibold border-0",
            getTagColorClass(tag)
          )}
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}
