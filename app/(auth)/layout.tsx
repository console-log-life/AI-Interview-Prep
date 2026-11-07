import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Logo } from "@/components/layout/logo";

const HIGHLIGHTS = [
  "Adaptive AI interviews that follow up on your actual answers",
  "Timed assessments across 13 categories with topic-level results",
  "Coding practice in Python, Java, C++ and JavaScript",
  "A readiness score built from what you really did, not a demo",
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Form column */}
      <div className="flex flex-col">
        <div className="p-6">
          <Logo />
        </div>
        <main
          id="main-content"
          className="flex flex-1 items-center justify-center px-6 pb-12"
        >
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>

      {/* Brand column — decorative, hidden on small screens */}
      <aside className="relative hidden border-l bg-muted/40 lg:flex lg:flex-col lg:justify-center lg:px-14">
        <div
          className="surface-grid pointer-events-none absolute inset-0 opacity-40"
          aria-hidden="true"
        />
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Practice smarter. Interview better.
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            One platform for mock interviews, assessments, coding practice and
            the feedback that ties them together.
          </p>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex gap-3 text-sm">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground text-pretty">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-xs text-muted-foreground">
            <Link href="/" className="underline underline-offset-4">
              Back to home
            </Link>
          </p>
        </div>
      </aside>
    </div>
  );
}
