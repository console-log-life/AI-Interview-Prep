import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The product mark.
 *
 * The glyph is drawn rather than set in type so it stays crisp at 32px and
 * carries a little meaning: an upward path with a waypoint — preparation as
 * a tracked climb, which is what the product measures.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
      >
        <path d="M4 18 L10 12 L14 15 L20 7" />
        <circle cx="20" cy="7" r="1.75" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Logo({
  href = "/",
  className,
  iconOnly = false,
}: {
  href?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      aria-label="PrepPilot home"
    >
      <LogoMark />
      {!iconOnly && <span className="text-[15px]">PrepPilot</span>}
    </Link>
  );
}
