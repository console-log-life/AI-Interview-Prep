"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Light / dark / system switch.
 *
 * Added because the dark palette had no way to be reached: `globals.css` has
 * carried a full `.dark` block all along, and nothing ever put that class on
 * the document, so half the design system was unreachable.
 *
 * No dependency for this. `next-themes` solves a harder problem than this app
 * has — one class on `<html>`, one key in `localStorage` — and the flash of
 * the wrong theme is handled by the inline script in `app/layout.tsx`, which
 * runs before first paint and is the only part that genuinely needs care.
 */

export const THEME_KEY = "preppilot:theme";

type Choice = "light" | "dark" | "system";

const OPTIONS: Array<{ value: Choice; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Applies a choice to the document and remembers it. */
function apply(choice: Choice): void {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = choice === "dark" || (choice === "system" && prefersDark);

  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";

  try {
    if (choice === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private window or blocked storage. The choice still applies for this
    // page; it simply will not be remembered, which is the right way for
    // this particular failure to degrade.
  }
}

export function ThemeToggle() {
  /**
   * Starts as "system" and is corrected in an effect.
   *
   * Reading `localStorage` during render would produce different markup on the
   * server and the client and trip hydration. The icon is therefore briefly
   * the system one, which is invisible in practice because the inline script
   * has already set the actual colours.
   */
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") setChoice(stored);
    } catch {
      // Nothing stored and nothing readable: system it is.
    }
  }, []);

  // Follow the OS while the choice is "system", so switching the laptop to
  // dark at sunset moves the app with it rather than at the next reload.
  useEffect(() => {
    if (choice !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [choice]);

  const active = OPTIONS.find((option) => option.value === choice) ?? OPTIONS[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <active.icon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => {
              setChoice(option.value);
              apply(option.value);
            }}
            className={cn(option.value === choice && "font-medium text-primary")}
          >
            <option.icon aria-hidden="true" />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
