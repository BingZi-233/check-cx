import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/topbar";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div>
          <p className="text-6xl font-bold tracking-tight text-foreground/10">404</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            This page doesn&apos;t exist or has been moved.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-md">
          <Link href="/">
            <ChevronLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
