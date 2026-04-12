import {DashboardBootstrap} from "@/components/dashboard-bootstrap";
import {ClientYear} from "@/components/client-time";
import {Separator} from "@/components/ui/separator";
import packageJson from "@/package.json";

const ESTIMATED_VERSION = `v${packageJson.version}`;

export default function Home() {
  return (
    <div className="py-8 md:py-16">
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 sm:gap-8 sm:px-6 lg:px-12">
        <DashboardBootstrap />
      </main>

      <footer className="mt-16">
        <Separator className="opacity-40" />
        <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center justify-between gap-4 px-3 py-6 sm:flex-row sm:px-6 lg:px-12">
          <div className="text-sm text-muted-foreground">
            © <ClientYear placeholder="2026" /> Check CX. All rights reserved.
          </div>

          <div className="flex items-center gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/60 px-3 py-1 text-xs text-muted-foreground shadow-sm transition hover:border-border/80 hover:text-foreground">
              <span className="font-medium opacity-70">Ver.</span>
              <span className="font-mono">{ESTIMATED_VERSION}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
