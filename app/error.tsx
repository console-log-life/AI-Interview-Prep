"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * Next.js passes the error object here, but its `message` may contain internal
 * detail, so it is deliberately NOT rendered. The user gets a fixed, safe
 * message plus the digest, which they can quote in a bug report.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"
        aria-hidden="true"
      >
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground text-pretty">
        We hit an unexpected problem loading this page. Your data is safe — try
        again, and if it keeps happening head back to the dashboard.
      </p>

      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">
            <Home aria-hidden="true" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
