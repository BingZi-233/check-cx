import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function ProviderCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3.5 p-4 pl-5 pt-4">
        {/* header */}
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <Skeleton className="h-3 w-36" />
          </div>
        </div>

        <Separator />

        {/* metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-8" />
            <Skeleton className="h-5 w-14" />
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <div className="flex justify-between">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-1 w-full rounded-sm" />
          </div>
        </div>

        <Separator />

        {/* timeline */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-6 w-full rounded-sm" />
          <div className="flex justify-between">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-2.5 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupSectionSkeleton({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div className="space-y-4">
      {/* group header */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3.5 w-16 rounded" />
        <div className="flex-1">
          <Skeleton className="h-px w-full" />
        </div>
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
      {/* cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cardCount }).map((_, i) => (
          <ProviderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      {/* page title */}
      <div className="flex items-end justify-between border-b pb-6">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-7 w-48 rounded-md" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <GroupSectionSkeleton key={i} cardCount={3} />
      ))}
    </div>
  );
}

export function GroupDashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-7 w-36 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProviderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
