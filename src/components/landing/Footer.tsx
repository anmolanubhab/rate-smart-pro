import { Linkedin, Youtube, Instagram, Twitter } from "lucide-react";
import rdProLogo from "/rdpro-logo.png";

const FOOTER = {
  Product: ["Features", "Modules", "Industries", "Integrations", "Pricing"],
  Company: ["About", "Careers", "Partners", "Press", "Customers"],
  Support: ["Help Center", "Status", "Onboarding", "Documentation"],
  Resources: ["Blog", "Guides", "Webinars", "Changelog"],
  "Contact Us": ["sales@rd-pro.app", "+91 80 4000 4000", "Bengaluru, India"],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/60">
      <div className="mx-auto max-w-[1280px] px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <img src={rdProLogo} alt="RD-PRO" className="h-9 w-9 object-contain" />
              <div className="leading-tight">
                <div className="text-sm font-bold text-foreground">RD-PRO</div>
                <div className="text-[11px] text-muted-foreground">Business Operating System</div>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              One Platform. Every Business. Complete Automation.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {[Linkedin, Youtube, Instagram, Twitter].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                  aria-label="Social link"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
          {Object.entries(FOOTER).map(([col, items]) => (
            <div key={col}>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                {col}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {items.map((it) => (
                  <li key={it}>
                    <a href="#" className="text-sm text-muted-foreground transition hover:text-foreground">
                      {it}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} RD-PRO. All rights reserved.</span>
          <div className="flex gap-5">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
