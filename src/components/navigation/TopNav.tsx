// src/components/navigation/TopNav.tsx
//
// Premium SaaS top bar (Zoho Books / Razorpay / Xero inspired). Sits above
// the sidebar + content, full width, 72px tall. Reads quick actions from the
// same navigation registry the sidebar and search use, so it never drifts
// out of sync with the rest of the app.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Bell,
  Plus,
  Sun,
  Moon,
  HelpCircle,
  ChevronDown,
  User,
  Building2,
  Settings as SettingsIcon,
  Keyboard,
  LifeBuoy,
  LogOut,
  Menu,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness, setActiveBusinessId } from "@/hooks/useBusiness";
import { useTheme } from "@/hooks/useTheme";
import { useNavigation } from "@/lib/navigation/useNavigation";
import rdProLogo from "/rdpro-logo.png";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function TopNav() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { business } = useBusiness();
  const { theme, toggle } = useTheme();
  const { quickActions } = useNavigation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  const switchCompany = () => {
    setActiveBusinessId(null);
    navigate("/companies");
  };

  return (
    <header className="sticky top-0 z-40 flex h-[72px] shrink-0 items-center gap-4 border-b border-border bg-card px-4 md:px-6">
      {/* Mobile menu trigger */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground hover:text-foreground md:hidden"
        onClick={() => window.dispatchEvent(new Event("rdpro:open-mobile-nav"))}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* LEFT — Logo */}
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        className="flex shrink-0 items-center gap-2.5 rounded-lg transition-smooth hover:opacity-80"
      >
        <img src={rdProLogo} alt="RD Pro" className="h-8 w-8 object-contain" />
        <span className="hidden text-lg font-bold tracking-tight text-foreground sm:inline">RD Pro</span>
      </button>

      {/* MIDDLE — Global Search */}
      <div className="mx-auto w-full max-w-xl flex-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("rdpro:open-search"))}
          className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-border bg-muted/60 px-3.5 text-left text-sm text-muted-foreground transition-smooth hover:bg-muted"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">Search anything...</span>
          <kbd className="hidden shrink-0 items-center rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
            Ctrl + K
          </kbd>
        </button>
      </div>

      {/* RIGHT — Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Notifications */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 rounded-xl p-4">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            <p className="mt-1 text-sm text-muted-foreground">You're all caught up — no new notifications.</p>
          </PopoverContent>
        </Popover>

        {/* Quick Create */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" className="rounded-xl bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover">
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel>Quick Create</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {quickActions.length === 0 && (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">No quick actions available</div>
            )}
            {quickActions.map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => item.route && navigate(item.route)} className="gap-2">
                {item.icon && <item.icon className="h-4 w-4 text-primary" />}
                {item.quickAction?.label ?? item.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" onClick={toggle} className="text-muted-foreground hover:text-foreground">
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* Help */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <HelpCircle className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 rounded-xl p-4">
            <p className="text-sm font-semibold text-foreground">Need help?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Reach us at <span className="font-medium text-foreground">support@rdpro.app</span> or press{" "}
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[11px]">Ctrl + K</kbd> to find any
              page instantly.
            </p>
          </PopoverContent>
        </Popover>

        <div className="mx-1 h-8 w-px bg-border" />

        {/* User / Company profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-smooth hover:bg-muted"
            >
              <Avatar className="h-9 w-9 border border-border">
                <AvatarFallback className="bg-primary-light text-sm font-semibold text-primary">
                  {initialsFor(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight md:block">
                <p className="max-w-[140px] truncate text-sm font-semibold text-foreground">{displayName}</p>
                <p className="max-w-[140px] truncate text-xs text-muted-foreground">
                  {business?.business_name ?? "—"}
                </p>
              </div>
              <ChevronDown className="hidden h-4 w-4 text-muted-foreground md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-xl">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2">
              <User className="h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={switchCompany} className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="flex-1">Company</span>
              <span className="max-w-[90px] truncate text-xs text-muted-foreground">
                {business?.business_name}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2">
              <SettingsIcon className="h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShortcutsOpen(true)} className="gap-2">
              <Keyboard className="h-4 w-4" /> Keyboard Shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={(e) => e.preventDefault()}>
              <LifeBuoy className="h-4 w-4" /> Support
              <span className="ml-auto text-xs text-muted-foreground">support@rdpro.app</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Keyboard shortcuts reference dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {[
              ["Ctrl + K", "Open global search"],
              ["↑ / ↓", "Navigate results"],
              ["Enter", "Open selected"],
              ["Esc", "Close dialog"],
            ].map(([keys, desc]) => (
              <div key={keys} className="flex items-center justify-between rounded-lg px-1 py-2 text-sm">
                <span className="text-muted-foreground">{desc}</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium">{keys}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
