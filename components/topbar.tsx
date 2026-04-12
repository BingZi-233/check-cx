"use client";

import Link from "next/link";
import { Activity, Github } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TopbarProps {
  controls?: React.ReactNode;
  className?: string;
}

export function Topbar({ controls, className }: TopbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 w-full items-center border-b bg-background/95 backdrop-blur-sm",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground transition-opacity hover:opacity-80"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-background">
                <Activity className="h-3.5 w-3.5" />
              </span>
              <span className="hidden sm:inline">Check CX</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Back to overview</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5" />

        {/* Page controls slot */}
        {controls && (
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {controls}
          </div>
        )}

        {/* Right side */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="https://github.com/BingZi-233/check-cx"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Github className="h-4 w-4" />
                <span className="sr-only">GitHub</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent>View on GitHub</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <ThemeToggle />
              </span>
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
