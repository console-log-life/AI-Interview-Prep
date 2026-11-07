import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted"
        aria-hidden="true"
      >
        <FileQuestion className="h-7 w-7 text-muted-foreground" />
      </div>

      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground text-pretty">
        That page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href="/dashboard">
            <Home aria-hidden="true" />
            Go to dashboard
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
