"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, Menu, Search, Settings, User, X } from "lucide-react";

import { AppNav } from "@/components/layout/app-nav";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { CommandPalette } from "@/components/layout/command-palette";
import { Logo } from "@/components/layout/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsOf } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/session";

export function AppHeader({ user }: { user: SessionUser }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const isAdmin = user.role === "ADMIN";

  // Platform detection is deferred to an effect: reading `navigator` during
  // render would differ between server and client and break hydration.
  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(window.navigator.platform));
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
        >
          <Menu aria-hidden="true" />
        </Button>

        <div className="lg:hidden">
          <Logo href="/dashboard" iconOnly />
        </div>

        <div className="hidden min-w-0 lg:block">
          <Breadcrumbs />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Desktop: a real input-looking trigger. Mobile: an icon button,
              because a 260px search box would eat the whole header. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden h-9 w-56 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm
                       text-muted-foreground transition-colors hover:bg-muted
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex xl:w-72"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="kbd">{isMac ? "⌘" : "Ctrl"}K</kbd>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
          >
            <Search aria-hidden="true" />
          </Button>

          {isAdmin && (
            <Badge variant="outline" className="hidden sm:inline-flex">
              Admin
            </Badge>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Account menu"
              >
                <Avatar>
                  {user.image && <AvatarImage src={user.image} alt="" />}
                  <AvatarFallback>
                    {initialsOf(user.name, user.email)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="truncate text-sm font-medium">
                  {user.name || "Your account"}
                </p>
                <p className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User aria-hidden="true" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings aria-hidden="true" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => signOut({ callbackUrl: "/" })}
                className="text-destructive focus:text-destructive"
              >
                <LogOut aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* Mobile navigation drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 animate-in fade-in"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          />
          <div
            id="mobile-nav"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r bg-background shadow-lg
                       animate-in slide-in-from-left duration-200"
          >
            <div className="flex h-16 items-center justify-between border-b px-4">
              <Logo href="/dashboard" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <AppNav isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
