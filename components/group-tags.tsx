"use client";

import {Badge} from "@/components/ui/badge";
import {cn} from "@/lib/utils";
import {getTagColorClass, parseTagList} from "@/lib/utils/tag-colors";

interface GroupTagsProps {
  tags?: string | null;
  className?: string;
}

export function GroupTags({ tags, className }: GroupTagsProps) {
  const items = parseTagList(tags);
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {items.map((tag, index) => (
        <Badge
          key={`${tag}-${index}`}
          className={cn(
            "border-transparent px-2.5 py-0.5 text-xs font-semibold",
            getTagColorClass(tag)
          )}
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}
