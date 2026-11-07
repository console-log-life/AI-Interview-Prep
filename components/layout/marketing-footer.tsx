import Link from "next/link";

import { Logo } from "@/components/layout/logo";

const SECTIONS = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#modules", label: "Modules" },
      { href: "#how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/register", label: "Create an account" },
      { href: "/login", label: "Sign in" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container grid gap-10 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground text-pretty">
            AI-powered mock interviews, assessments, coding practice and
            personalized feedback in one platform.
          </p>
        </div>

        {SECTIONS.map((section) => (
          <nav key={section.title} aria-label={section.title}>
            <h2 className="text-sm font-semibold">{section.title}</h2>
            <ul className="mt-3 space-y-2">
              {section.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t">
        <div className="container flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} PrepPilot. Built as a B.Tech major project.</p>
          <p>
            A preparation tool — it does not make hiring decisions and is not
            affiliated with any employer.
          </p>
        </div>
      </div>
    </footer>
  );
}
