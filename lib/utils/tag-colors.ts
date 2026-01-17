export const parseTagList = (tags?: string | null): string[] => {
  if (!tags) {
    return [];
  }

  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const TAG_COLOR_CLASSES = [
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400", // "商业"
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400", // "公益"
  "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-400",
];

const hashTag = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

export const getTagColorClass = (tag: string) => {
  if (!tag) {
    return TAG_COLOR_CLASSES[0];
  }
  const index = hashTag(tag) % TAG_COLOR_CLASSES.length;
  return TAG_COLOR_CLASSES[index];
};
