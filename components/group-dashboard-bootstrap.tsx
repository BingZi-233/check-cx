"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

import { GroupDashboardView } from "@/components/group-dashboard-view";
import { GroupDashboardSkeleton } from "@/components/dashboard-skeleton";
import { NotificationBanner } from "@/components/notification-banner";
import { Topbar } from "@/components/topbar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fetchGroupWithCache } from "@/lib/core/group-frontend-cache";
import type { GroupDashboardData } from "@/lib/core/group-data";
import type { AvailabilityPeriod } from "@/lib/types";

const DEFAULT_PERIOD: AvailabilityPeriod = "7d";

interface GroupDashboardBootstrapProps {
  groupName: string;
}

export function GroupDashboardBootstrap({ groupName }: GroupDashboardBootstrapProps) {
  const [data, setData] = useState<GroupDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (force?: boolean) => {
      try {
        const result = await fetchGroupWithCache({
          groupName,
          trendPeriod: DEFAULT_PERIOD,
          forceFresh: force,
          revalidateIfFresh: true,
          onBackgroundUpdate: setData,
        });
        setError(null);
        setData(result.data);
      } catch {
        setError("Failed to load group data.");
      }
    },
    [groupName]
  );

  useEffect(() => {
    let active = true;
    fetchGroupWithCache({
      groupName,
      trendPeriod: DEFAULT_PERIOD,
      revalidateIfFresh: true,
      onBackgroundUpdate: (d) => { if (active) setData(d); },
    })
      .then((r) => { if (active) { setError(null); setData(r.data); } })
      .catch(() => { if (active) setError("Failed to load group data."); });
    return () => { active = false; };
  }, [groupName]);

  if (!data) {
    return (
      <>
        <NotificationBanner />
        <Topbar />
        <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
          {error ? (
            <div className="flex flex-col items-center gap-4 py-20">
              <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Failed to load</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button size="sm" onClick={() => loadData(true)} className="rounded-md">
                Retry
              </Button>
            </div>
          ) : (
            <GroupDashboardSkeleton />
          )}
        </div>
      </>
    );
  }

  return <GroupDashboardView groupName={groupName} initialData={data} />;
}
