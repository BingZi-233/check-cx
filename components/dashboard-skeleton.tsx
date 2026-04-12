import {Skeleton} from "@/components/ui/skeleton";
import {CornerPlus} from "@/components/ui/corner-plus";

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-background/40 p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-16 w-full" />
      <div className="flex items-center gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

function ProviderCardSkeleton() {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-border/40 bg-background/40">
      <div className="p-5">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg sm:h-12 sm:w-12" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-28 sm:h-5 sm:w-32" />
                <Skeleton className="h-5 w-12 rounded-md sm:h-6 sm:w-14" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-16 rounded-md" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 p-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-5 w-20" />
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-5 w-20" />
          </div>
        </div>

        <div className="space-y-3 border-t border-border/30 pt-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

function GroupPanelSkeleton({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <section className="rounded-2xl border bg-white/30 p-6 backdrop-blur-sm dark:bg-black/10">
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-1 min-w-0 items-center gap-3 sm:gap-4">
          <Skeleton className="h-8 w-8 rounded-xl sm:h-10 sm:w-10" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Skeleton className="h-5 w-32 sm:h-6 sm:w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded-full sm:h-10 sm:w-20" />
      </div>

      <div className="mt-4 grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cardCount }).map((_, index) => (
          <ProviderCardSkeleton key={`provider-card-skeleton-${index}`} />
        ))}
      </div>
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="relative">
      <CornerPlus className="fixed left-4 top-4 h-6 w-6 text-border md:left-8 md:top-8" />
      <CornerPlus className="fixed right-4 top-4 h-6 w-6 text-border md:right-8 md:top-8" />
      <CornerPlus className="fixed bottom-4 left-4 h-6 w-6 text-border md:bottom-8 md:left-8" />
      <CornerPlus className="fixed bottom-4 right-4 h-6 w-6 text-border md:bottom-8 md:right-8" />

      <header className="relative z-10 mb-8 flex flex-col justify-between gap-6 sm:mb-12 sm:gap-8 lg:flex-row lg:items-end">
        <div className="space-y-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Skeleton className="h-7 w-7 rounded-lg sm:h-8 sm:w-8" />
            <Skeleton className="h-3 w-24 sm:h-4 sm:w-28" />
            <div className="h-3 w-[1px] bg-border/60 sm:h-4" />
            <Skeleton className="h-3 w-16 sm:h-4 sm:w-20" />
            <div className="h-3 w-[1px] bg-border/60 sm:h-4" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </div>

          <div className="space-y-3">
            <Skeleton className="h-10 w-72 sm:h-14 sm:w-[520px]" />
            <Skeleton className="h-6 w-64 sm:h-8 sm:w-80" />
          </div>

          <div className="space-y-2">
            <Skeleton className="h-4 w-80 max-w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 sm:gap-4 lg:items-end">
          <div className="w-full sm:w-64">
            <Skeleton className="h-10 w-full rounded-full" />
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-2 py-1">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-6 w-36 rounded-full" />
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-2 py-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-4 py-1.5">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
            <Skeleton className="h-3 w-28" />
            <div className="h-3 w-[1px] bg-border/60" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-[50vh]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <GroupPanelSkeleton key={`group-panel-skeleton-${index}`} cardCount={3} />
          ))}
        </div>
      </main>
    </div>
  );
}

export function GroupDashboardSkeleton() {
  return (
    <div className="relative">
      <header className="mb-8 flex flex-col justify-between gap-6 sm:mb-12 sm:gap-8 lg:flex-row lg:items-end">
        <div className="space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-60" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-col items-start gap-3 sm:gap-4 lg:items-end">
          <Skeleton className="h-8 w-40 rounded-full" />
          <Skeleton className="h-8 w-36 rounded-full" />
          <Skeleton className="h-4 w-52" />
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <CardSkeleton key={`group-skeleton-${index}`} />
        ))}
      </section>
    </div>
  );
}
