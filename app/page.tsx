import { DashboardBootstrap } from "@/components/dashboard-bootstrap";
import { Separator } from "@/components/ui/separator";
import { ClientYear } from "@/components/client-time";
import packageJson from "@/package.json";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <DashboardBootstrap />
      </div>

      <footer>
        <Separator />
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-xs text-muted-foreground">
            © <ClientYear placeholder="2026" /> Check CX
          </p>
          <span className="font-mono text-xs text-muted-foreground/50">
            v{packageJson.version}
          </span>
        </div>
      </footer>
    </div>
  );
}
