import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Check, CheckCircle2, Star, ChevronDown,
  ShoppingCart, Package, Boxes, Factory, Wallet, FileText, Users, MessageSquare, Sparkles,
  Car, Pill, Store, Truck, HardHat, Sofa, UtensilsCrossed, Headphones, Building2,
  AlertTriangle, FileSpreadsheet, RefreshCcw, ReceiptText, EyeOff,
} from "lucide-react";
import { Header } from "@/components/landing/Header";
import { HeroDashboard } from "@/components/landing/HeroDashboard";
import { HeroVisual } from "@/components/landing/HeroVisual";
import { RdAiChat } from "@/components/landing/RdAiChat";
import { Footer } from "@/components/landing/Footer";

function Section({
  id, eyebrow, title, subtitle, children, className = "",
}: {
  id?: string; eyebrow?: string; title?: React.ReactNode; subtitle?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`mx-auto max-w-[1280px] px-6 py-20 sm:py-24 ${className}`}>
      {(eyebrow || title || subtitle) && (
        <div className="mx-auto mb-12 max-w-2xl text-center">
          {eyebrow && (
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              {eyebrow}
            </span>
          )}
          {title && (
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-[44px] md:leading-[1.1]">
              {title}
            </h2>
          )}
          {subtitle && <p className="mt-4 text-base text-muted-foreground sm:text-lg">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Hero() {
  return (
    <section className="relative isolate flex overflow-hidden min-h-[600px] sm:min-h-[680px] lg:min-h-[760px]">
      {/* Immersive background scene — inventory shelves, invoice & analytics
          cards, faint AI nodes. Feathered via SVG masks (see HeroVisual) so
          it blends into the page with no visible image boundary; a matching
          CSS tint underneath keeps the fade seamless outside the SVG's own
          viewBox. Hidden below sm: so mobile keeps a plain, fully legible hero. */}
      <div className="pointer-events-none absolute inset-0 -z-10 hidden sm:block">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,hsl(var(--background))_0%,hsl(var(--background))_38%,rgba(224,231,255,0.55)_64%,rgba(237,233,254,0.4)_100%)]" />
        <HeroVisual className="hero-visual-drift absolute inset-0 h-full w-full opacity-70 md:opacity-90 lg:opacity-100" />
      </div>
      {/* Mobile fallback — same soft indigo wash, no illustration detail */}
      <div className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[420px] bg-[radial-gradient(60%_60%_at_60%_0%,rgba(79,70,229,0.12),transparent_70%)] sm:hidden" />

      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-12 px-6 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <div>
          <span className="hero-badge inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> AI Powered Business Operating System
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-[64px] lg:leading-[1.05]">
            <span className="hero-line-1 block">One Platform.</span>
            <span className="hero-line-2 block">Every Business.</span>
            <span className="hero-line-3 text-gradient block">Complete Automation.</span>
          </h1>
          <p className="hero-desc mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Run your entire business seamlessly with RD-PRO. From Sales to Finance, Inventory to AI —
            everything in one intelligent platform.
          </p>
          <div className="hero-ctas mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/auth?tab=signup"
              className="bg-brand-gradient inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-elevated transition hover:opacity-95 active:scale-[0.98]"
            >
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/auth?tab=signup"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground shadow-soft transition hover:border-primary/40 hover:text-primary"
            >
              Book Demo
            </Link>
          </div>
          <div className="hero-trust mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" /> No credit card required
            <span className="mx-2 h-1 w-1 rounded-full bg-border" />
            14-day free trial
          </div>
        </div>
        <div className="hero-dashboard-in">
          <HeroDashboard />
        </div>
      </div>
    </section>
  );
}

const LOGOS = ["Tata", "Mahindra", "Reliance", "TVS", "Godrej", "Ashok Leyland"];

function TrustBar() {
  return (
    <section className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-[1280px] px-6 py-10">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Trusted by 10,000+ Businesses
        </p>
        <div className="mt-6 grid grid-cols-2 items-center gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {LOGOS.map((l) => (
            <div key={l} className="group text-center text-xl font-bold tracking-tight text-muted-foreground/70 grayscale transition hover:text-primary hover:grayscale-0">
              {l}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PROBLEMS = [
  { icon: ShoppingCart, t: "Lost Orders", d: "Orders slip through WhatsApp, email and notebooks every single day." },
  { icon: FileSpreadsheet, t: "Duplicate Entries", d: "Re-typing data across sheets causes costly mismatches and rework." },
  { icon: Boxes, t: "Wrong Inventory", d: "You never really know what's in stock — until you've already lost a sale." },
  { icon: ReceiptText, t: "Manual Accounting", d: "Days lost to reconciliation. Tally and Excel can't keep up with you." },
  { icon: RefreshCcw, t: "Delayed GST", d: "Last-minute filing chaos, missed deadlines and avoidable penalties." },
  { icon: EyeOff, t: "No Visibility", d: "No single view of sales, cash flow or stock. Decisions are guesses." },
];

function Problems() {
  return (
    <Section id="features" eyebrow="The Problem"
      title="Your Business Should Not Run On Excel Sheets"
      subtitle="Spreadsheets, WhatsApp groups and disconnected tools quietly cost you crores every year.">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PROBLEMS.map(({ icon: Icon, t, d }) => (
          <div key={t} className="hover-lift rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-warning">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-base font-semibold text-foreground">{t}</h3>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const SOLUTIONS = [
  { icon: ShoppingCart, t: "Sales", d: "Quote → invoice → payment in one flow." },
  { icon: Package, t: "Purchase", d: "Smart POs with auto-reorder suggestions." },
  { icon: Boxes, t: "Inventory", d: "Real-time stock across every location." },
  { icon: Factory, t: "Manufacturing", d: "BOM, work orders and shop-floor control." },
  { icon: Wallet, t: "Finance", d: "Ledgers, P&L and cash-flow on autopilot." },
  { icon: FileText, t: "GST", d: "Auto-generated GSTR-1, 3B and reconciliation." },
  { icon: Users, t: "HRMS", d: "Attendance, payroll and performance in one place." },
  { icon: MessageSquare, t: "CRM", d: "Leads, pipelines and follow-ups that close." },
  { icon: Sparkles, t: "AI", d: "Ask questions, get answers — in plain English." },
];

function Solutions() {
  return (
    <Section id="modules" eyebrow="The Solution"
      title={<>RD-PRO Solves <span className="text-gradient">Everything</span></>}
      subtitle="One unified system that replaces a dozen disconnected tools.">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SOLUTIONS.map(({ icon: Icon, t, d }) => (
          <div key={t} className="hover-lift group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="bg-brand-gradient absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20" />
            <div className="bg-brand-gradient grid h-11 w-11 place-items-center rounded-xl text-primary-foreground shadow-elevated">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-foreground">{t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

const INDUSTRIES_LIST = [
  { icon: Car, t: "Automobile" },
  { icon: Pill, t: "Pharma" },
  { icon: Factory, t: "Manufacturing" },
  { icon: Store, t: "Retail" },
  { icon: Truck, t: "Wholesale" },
  { icon: HardHat, t: "Construction" },
  { icon: Sofa, t: "Interior" },
  { icon: UtensilsCrossed, t: "Food" },
  { icon: Headphones, t: "Service" },
  { icon: Building2, t: "Enterprise" },
];

function Industries() {
  return (
    <Section id="industries" eyebrow="Industries" title="Industries We Serve"
      subtitle="Battle-tested across 25+ sectors and 10,000+ companies.">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {INDUSTRIES_LIST.map(({ icon: Icon, t }) => (
          <div key={t} className="hover-lift flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 text-center shadow-soft">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold text-foreground">{t}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function MeetAI() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(124,58,237,0.08),transparent_70%)]" />
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Meet RD AI
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-[44px] md:leading-[1.1]">
            Just ask. <span className="text-gradient">RD AI runs your business.</span>
          </h2>
          <p className="mt-4 max-w-lg text-base text-muted-foreground sm:text-lg">
            No dashboards to dig through. Ask in plain English and get instant, accurate answers from your live business data.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "Real-time answers from sales, stock & finance",
              "AI recommendations for purchase and pricing",
              "Detects anomalies before they cost you money",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                {x}
              </li>
            ))}
          </ul>
        </div>
        <RdAiChat />
      </div>
    </section>
  );
}

const INTEGRATIONS = ["Amazon", "Shopify", "WhatsApp", "Google", "Microsoft", "Banks", "GST", "UPI"];

function Integrations() {
  return (
    <Section eyebrow="Integrations" title="Seamless Integrations"
      subtitle="Connect every tool you already use — in minutes, not months.">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {INTEGRATIONS.map((n) => (
          <div key={n} className="hover-lift flex h-24 items-center justify-center rounded-2xl border border-border bg-card text-base font-semibold text-foreground shadow-soft">
            {n}
          </div>
        ))}
      </div>
    </Section>
  );
}

const PLANS = [
  { name: "Starter", price: { m: 1499, y: 14990 }, desc: "For small teams getting started.", features: ["Up to 3 users", "Sales & Inventory", "GST filing", "Email support"] },
  { name: "Growth", price: { m: 3999, y: 39990 }, desc: "For growing businesses.", features: ["Up to 15 users", "Everything in Starter", "HRMS + CRM", "Priority support"] },
  { name: "Business", price: { m: 7999, y: 79990 }, desc: "Most popular for SMBs.", features: ["Up to 50 users", "Manufacturing module", "RD AI included", "Dedicated manager"], popular: true },
  { name: "Enterprise", price: { m: 0, y: 0 }, desc: "Custom for large companies.", features: ["Unlimited users", "Custom workflows", "SLA & on-prem", "24×7 support"] },
];

function Pricing() {
  const [yearly, setYearly] = useState(true);
  return (
    <Section id="pricing" eyebrow="Pricing" title="Simple, Transparent Pricing"
      subtitle="Pick a plan that fits today — upgrade as you grow. No hidden fees.">
      <div className="mb-10 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-soft">
          <button onClick={() => setYearly(false)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${!yearly ? "bg-brand-gradient text-primary-foreground shadow-elevated" : "text-muted-foreground hover:text-foreground"}`}>
            Monthly
          </button>
          <button onClick={() => setYearly(true)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${yearly ? "bg-brand-gradient text-primary-foreground shadow-elevated" : "text-muted-foreground hover:text-foreground"}`}>
            Yearly <span className="ml-1 text-[11px] opacity-90">save 16%</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => {
          const isEnt = p.name === "Enterprise";
          const amount = yearly ? p.price.y : p.price.m;
          return (
            <div key={p.name}
              className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-soft transition ${
                p.popular ? "border-primary/40 shadow-glow ring-1 ring-primary/30" : "border-border hover-lift"
              }`}>
              {p.popular && (
                <span className="bg-brand-gradient absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-elevated">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <div className="mt-5 flex items-baseline gap-1">
                {isEnt ? (
                  <span className="text-3xl font-extrabold text-foreground">Custom</span>
                ) : (
                  <>
                    <span className="text-4xl font-extrabold tracking-tight text-foreground">
                      ₹{amount.toLocaleString("en-IN")}
                    </span>
                    <span className="text-sm text-muted-foreground">/{yearly ? "yr" : "mo"}</span>
                  </>
                )}
              </div>
              <ul className="mt-6 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Link to="/auth?tab=signup"
                className={`mt-8 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  p.popular
                    ? "bg-brand-gradient text-primary-foreground shadow-elevated hover:opacity-95"
                    : "border border-border bg-card text-foreground hover:border-primary/40 hover:text-primary"
                }`}>
                {isEnt ? "Contact Sales" : "Get Started"}
              </Link>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const TESTIMONIALS = [
  { q: "RD-PRO has transformed the way we run our business. 80% of our manual work is now automated.", n: "Rajesh Sharma", c: "ABC Industries" },
  { q: "We replaced four tools with RD-PRO. Our team finally has one source of truth.", n: "Priya Iyer", c: "Crescent Pharma" },
  { q: "RD AI flagged a stock issue before our buyer did. That alone paid for the platform.", n: "Mohit Verma", c: "Verma Motors" },
];

function Testimonials() {
  return (
    <Section eyebrow="Testimonials" title="What Our Customers Say"
      subtitle="Real stories from founders, operators and finance teams running on RD-PRO.">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.n} className="hover-lift flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex gap-0.5 text-warning">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-current" />
              ))}
            </div>
            <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-foreground">
              "{t.q}"
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3 border-t border-border pt-4">
              <div className="bg-brand-gradient grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-primary-foreground">
                {t.n.split(" ").map((x) => x[0]).join("")}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{t.n}</div>
                <div className="text-xs text-muted-foreground">{t.c}</div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

const FAQS = [
  { q: "What is RD-PRO?", a: "RD-PRO is an AI-powered Business Operating System that runs your Sales, Inventory, Finance, GST, HRMS, CRM and more from one unified platform." },
  { q: "Is GST included in RD-PRO?", a: "Yes. GST invoicing, GSTR-1, GSTR-3B and reconciliation are built in — no extra add-ons required." },
  { q: "Can I use RD-PRO on mobile?", a: "Absolutely. RD-PRO works beautifully on iOS, Android and any modern browser, with full offline-friendly sync." },
  { q: "Can I import my existing data from Excel?", a: "Yes. One-click import for Excel, Tally, Zoho and most popular systems with guided field mapping." },
  { q: "Can I create multiple businesses?", a: "Yes — manage unlimited companies, branches and GSTINs under a single RD-PRO account." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="resources" eyebrow="FAQ" title="Frequently Asked Questions"
      subtitle="Everything you need to know before you start your free trial.">
      <div className="mx-auto max-w-3xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <button onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left" aria-expanded={isOpen}>
                <span className="text-[15px] font-semibold text-foreground">{f.q}</span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : ""}`} />
              </button>
              <div className={`grid overflow-hidden px-5 transition-all duration-300 ${isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"}`}>
                <div className="min-h-0">
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="px-6 pb-24">
      <div className="bg-brand-gradient relative mx-auto max-w-[1280px] overflow-hidden rounded-3xl px-8 py-16 text-center shadow-glow sm:px-16 sm:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_60%_at_50%_0%,rgba(255,255,255,0.25),transparent_70%)]" />
        <h2 className="relative text-3xl font-extrabold tracking-tight text-primary-foreground sm:text-4xl md:text-5xl">
          Ready To Run Your Business On Autopilot?
        </h2>
        <p className="relative mx-auto mt-4 max-w-2xl text-base text-primary-foreground/85 sm:text-lg">
          Join 10,000+ businesses that ditched spreadsheets for RD-PRO. Get set up in under a day.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/auth?tab=signup"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-primary shadow-elevated transition hover:opacity-95 active:scale-[0.98]">
            Start Free Trial <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/auth?tab=signup"
            className="inline-flex items-center justify-center rounded-xl border border-white/40 bg-white/10 px-6 py-3.5 text-sm font-semibold text-primary-foreground backdrop-blur-sm transition hover:bg-white/20">
            Book Demo
          </Link>
        </div>
      </div>
    </section>
  );
}

const Landing = () => {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <TrustBar />
        <Problems />
        <Solutions />
        <Industries />
        <MeetAI />
        <Integrations />
        <Pricing />
        <Testimonials />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
