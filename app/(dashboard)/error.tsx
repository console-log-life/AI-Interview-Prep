"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, LayoutDashboard, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Error boundary scoped to the dashboard. Keeps the sidebar and header intact
 * so a failure in one page does not take the whole app shell down with it.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] route error:", error);
  }, [error]);

  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10"
          aria-hidden="true"
        >
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>

        <div>
          <h2 className="text-lg font-semibold">This page couldn&apos;t load</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground text-pretty">
            Something went wrong fetching your data. Nothing has been lost — try
            again, or move on and come back to it.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset} size="sm">
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">
              <LayoutDashboard aria-hidden="true" />
              Dashboard
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
