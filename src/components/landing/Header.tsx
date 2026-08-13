import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import rdProLogo from "/rdpro-logo.png";

const NAV = ["Features", "Industries", "Modules", "Pricing", "Resources"];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "glass border-b border-border/60 shadow-soft" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={rdProLogo} alt="RD-PRO" className="logo-heartbeat h-9 w-9 object-contain" />
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight text-foreground">RD-PRO</div>
            <div className="text-[11px] text-muted-foreground">Business Operating System</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map((n) => (
            <a
              key={n}
              href={`#${n.toLowerCase()}`}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {n}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            to="/auth?tab=login"
            className="px-3 py-2 text-sm font-medium text-foreground hover:text-primary"
          >
            Login
          </Link>
          <Link
            to="/auth?tab=signup"
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-soft transition hover:border-primary/40 hover:text-primary"
          >
            Book Demo
          </Link>
          <Link
            to="/auth?tab=signup"
            className="bg-brand-gradient rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elevated transition hover:opacity-95 active:scale-[0.98]"
          >
            Start Free Trial
          </Link>
        </div>

        <button
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-card lg:hidden">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-6 py-4">
            {NAV.map((n) => (
              <a
                key={n}
                href={`#${n.toLowerCase()}`}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                {n}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Link
                to="/auth?tab=login"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-4 py-2.5 text-center text-sm font-semibold"
              >
                Login
              </Link>
              <Link
                to="/auth?tab=signup"
                onClick={() => setOpen(false)}
                className="bg-brand-gradient rounded-xl px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
