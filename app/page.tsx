import { DashboardView } from "@/components/dashboard-view";
import { loadDashboardData } from "@/lib/core/dashboard-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ESTIMATED_VERSION = "v1.8.0";

export default async function Home() {
  const data = await loadDashboardData({ refreshMode: "missing" });

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-background to-muted/40 py-10">
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 md:px-8">
        <DashboardView initialData={data} />
      </main>
      <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow-lg backdrop-blur">
        <span className="uppercase tracking-widest text-[10px] text-muted-foreground/80">
          version
        </span>
        <span className="font-mono text-sm text-foreground">{ESTIMATED_VERSION}</span>
      </div>
    </div>
  );
}
