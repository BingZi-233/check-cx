import { DashboardView } from "@/components/dashboard-view";
import { loadDashboardData } from "@/lib/core/dashboard-data";
import packageJson from "@/package.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ESTIMATED_VERSION = `v${packageJson.version}`;

export default async function Home() {
  const data = await loadDashboardData({ refreshMode: "missing" });

  return (
    <div className="py-12 md:py-16">
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 sm:px-6 lg:px-12">
        <DashboardView initialData={data} />
      </main>
      
      <footer className="mt-16 py-6 text-center">
         <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/60 px-4 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition hover:border-border/80 hover:text-foreground">
          <span className="font-medium uppercase tracking-wider opacity-70">
            Version
          </span>
          <span className="font-mono text-current">{ESTIMATED_VERSION}</span>
        </div>
      </footer>
    </div>
  );
}
