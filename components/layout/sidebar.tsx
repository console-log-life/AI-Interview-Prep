"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import {
  ADMIN_NAV,
  MAIN_NAV,
  isNavActive,
  type NavItem,
  type NavSection,
} from "@/components/layout/nav-config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "preppilot:sidebar-collapsed";

/**
 * Desktop sidebar.
 *
 * Collapse state is persisted to localStorage and read in an effect rather
 * than during render — reading it during render would produce different
 * markup on the server and the client and trip hydration. The first paint is
 * therefore always expanded, which is the state most users are in.
 */
export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const sections: NavSection[] = isAdmin ? [...MAIN_NAV, ADMIN_NAV] : MAIN_NAV;

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "hidden shrink-0 flex-col border-r bg-muted/20 transition-[width] duration-200 lg:flex",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b",
          collapsed ? "justify-center px-2" : "px-6",
        )}
      >
        {collapsed ? (
          <Logo href="/dashboard" iconOnly />
        ) : (
          <Logo href="/dashboard" />
        )}
      </div>

      <nav
        aria-label="Primary"
        className="flex-1 overflow-y-auto scrollbar-thin px-2 py-4"
      >
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <h2 className="eyebrow px-3 pb-2">{section.title}</h2>
              )}
              {collapsed && <div className="mx-2 mb-2 border-t" aria-hidden />}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink
                      item={item}
                      active={isNavActive(pathname, item)}
                      collapsed={collapsed}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(!collapsed && "w-full justify-start")}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              Collapse
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

/**
 * A nav row.
 *
 * When collapsed the label is still rendered for screen readers and shown
 * sighted users as a hover/focus tooltip — a bare icon with no accessible
 * name is the classic failure of a collapsible sidebar.
 */
function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center rounded-md text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "h-10 w-full justify-center" : "gap-3 px-3 py-2",
        active
          ? "bg-brand/10 text-brand"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {/* Active indicator rail — reads at a glance without relying on colour. */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand"
        />
      )}
      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="truncate">{item.label}</span>
      )}

      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-2 hidden
                     whitespace-nowrap rounded-md border bg-popover px-2 py-1
                     text-xs font-medium text-popover-foreground shadow-md
                     group-hover:block group-focus-visible:block"
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}
