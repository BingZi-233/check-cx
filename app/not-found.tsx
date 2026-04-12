import Link from "next/link";
import {ChevronLeft, SearchX} from "lucide-react";
import {Button} from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/30 shadow-sm backdrop-blur-sm">
        <SearchX className="h-10 w-10 text-muted-foreground" />
      </div>

      <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
        404 Page Not Found
      </h1>

      <p className="mb-8 max-w-md text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>

      <Button asChild size="lg" className="rounded-full">
        <Link href="/">
          <ChevronLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </Button>
    </div>
  );
}
