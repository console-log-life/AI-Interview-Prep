"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  Braces,
  Brain,
  CalendarClock,
  ClipboardList,
  FileText,
  Loader2,
  Map as MapIcon,
  MessageSquareHeart,
  Search,
  Target,
  type LucideIcon,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { SearchGroup, SearchResult } from "@/lib/search/service";

type Command = {
  id: string;
  group: "Actions";
  title: string;
  subtitle: string | null;
  href: string;
  keywords: string;
};

type Row = (SearchResult | Command) & { icon: LucideIcon };

/**
 * Static navigation commands.
 *
 * These are the only entries not backed by a database row, and they are
 * honest about it — each is a real route in the application, not a promise of
 * a feature that does not exist.
 */
const COMMANDS: Command[] = [
  {
    id: "cmd-interview",
    group: "Actions",
    title: "Start a mock interview",
    subtitle: "Adaptive, graded, resume-aware",
    href: "/interview/new",
    keywords: "interview practice mock start new",
  },
  {
    id: "cmd-assessments",
    group: "Actions",
    title: "Take an assessment",
    subtitle: "Timed question sets",
    href: "/assessments",
    keywords: "assessment quiz test questions mcq",
  },
  {
    id: "cmd-coding",
    group: "Actions",
    title: "Solve a coding problem",
    subtitle: "Sandboxed execution",
    href: "/coding",
    keywords: "coding dsa problem code editor leetcode",
  },
  {
    id: "cmd-review",
    group: "Actions",
    title: "Review what I keep forgetting",
    subtitle: "Spaced repetition queue",
    href: "/practice",
    keywords: "review practice spaced mistakes forgetting due",
  },
  {
    id: "cmd-coach",
    group: "Actions",
    title: "Ask the AI coach",
    subtitle: "Grounded in your own results",
    href: "/coach",
    keywords: "coach ai chat ask help advice",
  },
  {
    id: "cmd-roadmap",
    group: "Actions",
    title: "Open my roadmap",
    subtitle: "Daily plan and long-term schedule",
    href: "/roadmap",
    keywords: "roadmap plan schedule tasks",
  },
  {
    id: "cmd-skills",
    group: "Actions",
    title: "See my skill ledger",
    subtitle: "Scores with confidence and trend",
    href: "/skills",
    keywords: "skills ledger strengths weaknesses",
  },
  {
    id: "cmd-progress",
    group: "Actions",
    title: "View progress analytics",
    subtitle: "Readiness over time",
    href: "/progress",
    keywords: "progress analytics charts history trend",
  },
  {
    id: "cmd-resume",
    group: "Actions",
    title: "Manage my resume",
    subtitle: "Upload, analyse, verify claims",
    href: "/resume",
    keywords: "resume cv upload claims",
  },
  {
    id: "cmd-jd",
    group: "Actions",
    title: "Match against a job description",
    subtitle: "Measured readiness for a role",
    href: "/job-description",
    keywords: "job jd match role company posting",
  },
];

const GROUP_ICON: Record<SearchGroup | "Actions", LucideIcon> = {
  Actions: Search,
  Interviews: Bot,
  Assessments: ClipboardList,
  Coding: Braces,
  Skills: Brain,
  Roadmap: MapIcon,
  "Job matching": Target,
  Resume: FileText,
};

const GROUP_ORDER: Array<SearchGroup | "Actions"> = [
  "Actions",
  "Interviews",
  "Skills",
  "Assessments",
  "Coding",
  "Roadmap",
  "Job matching",
  "Resume",
];

const ACTION_ICONS: Record<string, LucideIcon> = {
  "cmd-interview": Bot,
  "cmd-assessments": ClipboardList,
  "cmd-coding": Braces,
  "cmd-review": CalendarClock,
  "cmd-coach": MessageSquareHeart,
  "cmd-roadmap": MapIcon,
  "cmd-skills": Brain,
  "cmd-progress": BarChart3,
  "cmd-resume": FileText,
  "cmd-jd": Target,
};

/**
 * Command palette.
 *
 * Actions match locally and appear instantly; entity results come from
 * `/api/search` and are debounced, because the palette fires on every
 * keystroke. A stale response from a slower earlier request is discarded via
 * a request counter rather than being allowed to overwrite newer results.
 */
export function CommandPalette({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset when the palette closes so it never reopens mid-search.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      apiGet<{ results: SearchResult[] }>(
        `/api/search?q=${encodeURIComponent(trimmed)}`,
      )
        .then((data) => {
          // Ignore anything that is no longer the newest request.
          if (id !== requestId.current) return;
          setResults(data.results);
        })
        .catch(() => {
          if (id === requestId.current) setResults([]);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  const rows: Row[] = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const actions: Row[] = COMMANDS.filter((command) =>
      needle.length === 0
        ? true
        : `${command.title} ${command.keywords}`.toLowerCase().includes(needle),
    ).map((command) => ({
      ...command,
      icon: ACTION_ICONS[command.id] ?? Search,
    }));

    const entities: Row[] = results.map((result) => ({
      ...result,
      icon: GROUP_ICON[result.group] ?? Search,
    }));

    const all = [...actions, ...entities];

    return GROUP_ORDER.flatMap((group) =>
      all.filter((row) => row.group === group),
    );
  }, [query, results]);

  useEffect(() => {
    setActiveIndex(0);
  }, [rows.length]);

  const select = useCallback(
    (row: Row) => {
      onOpenChange(false);
      router.push(row.href);
    },
    [onOpenChange, router],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(1, rows.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + rows.length) % Math.max(1, rows.length),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) select(row);
    }
  }

  // Keep the highlighted row in view during keyboard navigation.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let lastGroup: string | null = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Search PrepPilot</DialogTitle>

        <div className="flex items-center gap-3 border-b px-4">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          {/* A command palette that does not focus its input on open is
              broken; the dialog traps focus, so this steals nothing. */}
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search interviews, skills, problems… or type a command"
            aria-label="Search PrepPilot"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={
              rows[activeIndex] ? `command-row-${activeIndex}` : undefined
            }
            className="h-14 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && (
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>

        <div
          id="command-results"
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          className="max-h-[min(60vh,420px)] overflow-y-auto scrollbar-thin p-2"
        >
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {query.trim().length < 2
                ? "Type at least two characters to search your data."
                : loading
                  ? "Searching…"
                  : `Nothing matches “${query.trim()}”.`}
            </p>
          ) : (
            rows.map((row, index) => {
              const showHeader = row.group !== lastGroup;
              lastGroup = row.group;
              const Icon = row.icon;

              return (
                <div key={row.id}>
                  {showHeader && (
                    <p className="eyebrow px-3 pb-1 pt-3 first:pt-1">
                      {row.group}
                    </p>
                  )}
                  <div
                    id={`command-row-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={index === activeIndex}
                    tabIndex={-1}
                    onClick={() => select(row)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                      index === activeIndex && "bg-accent",
                    )}
                  >
                    <Icon
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {row.title}
                      </span>
                      {row.subtitle && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.subtitle}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">↵</kbd>
            open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">esc</kbd>
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
