import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";

export interface QuickLink {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
}

// Lightweight "jump to the real page" panel for tabs that don't have a
// dedicated dashboard widget yet (Sales, Purchase) — no data fetching,
// just navigation, so it costs nothing to mount.
export default function QuickLinksPanel({ title, subtitle, links }: { title: string; subtitle: string; links: QuickLink[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="group rounded-2xl bg-card border border-border shadow-soft p-5 transition-smooth hover:shadow-elegant hover:-translate-y-1"
          >
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <l.icon className="h-5 w-5" />
            </div>
            <div className="mt-4 font-display font-semibold flex items-center gap-1.5">
              {l.label}
              <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{l.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
