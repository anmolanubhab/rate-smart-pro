import { useEffect, useState } from "react";
import { TrendingUp, ShoppingBag, IndianRupee, Boxes, ArrowUpRight, CheckCircle2 } from "lucide-react";

function useCountUp(target: number, duration = 1400) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function Stat({
  icon: Icon,
  label,
  value,
  suffix,
  prefix,
  delta,
  tint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  delta: string;
  tint: string;
}) {
  const v = useCountUp(value);
  const display =
    value >= 100 ? Math.round(v).toLocaleString("en-IN") : v.toFixed(2);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <div className={`grid h-9 w-9 place-items-center rounded-lg ${tint}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-success">
          <ArrowUpRight className="h-3 w-3" /> {delta}
        </span>
      </div>
      <div className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tracking-tight text-foreground">
        {prefix}
        {display}
        {suffix}
      </div>
    </div>
  );
}

function Sparkline() {
  const points = [22, 30, 26, 38, 34, 48, 44, 56, 62, 58, 72, 78];
  const max = Math.max(...points);
  const w = 280;
  const h = 90;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / max) * h}`)
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[90px] w-full">
      <defs>
        <linearGradient id="rd-hero-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rd-hero-spark)" />
      <path d={path} fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const ACTIVITY = [
  { t: "New order #4821", who: "Tata Motors", time: "2m" },
  { t: "Invoice paid", who: "Mahindra Auto", time: "9m" },
  { t: "Stock added", who: "Brake Pads ×120", time: "14m" },
];

const TOP = [
  { name: "Brake Pad Pro", v: "₹4.2L", pct: 92 },
  { name: "Engine Oil 5W", v: "₹3.1L", pct: 78 },
  { name: "Air Filter X", v: "₹2.4L", pct: 64 },
];

export function HeroDashboard() {
  return (
    <div className="relative">
      <div className="absolute -inset-10 -z-10 rounded-[40px] bg-brand-gradient opacity-[0.12] blur-3xl" />
      <div className="animate-float rounded-3xl border border-border bg-card p-5 shadow-glow">
        {/* window chrome */}
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
          <div className="rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            rd-pro.app / dashboard
          </div>
          <div className="w-10" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat icon={IndianRupee} label="Total Sales" prefix="₹" value={24.5} suffix=" Cr" delta="12.4%" tint="bg-indigo-50 text-indigo-600" />
          <Stat icon={ShoppingBag} label="Total Orders" value={215} delta="8.1%" tint="bg-violet-50 text-violet-600" />
          <Stat icon={TrendingUp} label="Total Profit" prefix="₹" value={3.45} suffix=" Cr" delta="6.2%" tint="bg-emerald-50 text-emerald-600" />
          <Stat icon={Boxes} label="Stock Items" value={4524} delta="3.0%" tint="bg-amber-50 text-amber-600" />
        </div>

        <div className="mt-3 grid grid-cols-5 gap-3">
          <div className="col-span-3 rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Revenue
                </div>
                <div className="text-base font-bold text-foreground">₹78.4L this month</div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                +18%
              </span>
            </div>
            <Sparkline />
          </div>

          <div className="col-span-2 rounded-2xl border border-border p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Top Products
            </div>
            <div className="mt-3 space-y-2.5">
              {TOP.map((p) => (
                <div key={p.name}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="text-muted-foreground">{p.v}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-border p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Live Activity
            </div>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-blink" /> live
            </span>
          </div>
          <ul className="space-y-2">
            {ACTIVITY.map((a) => (
              <li key={a.t} className="flex items-center gap-2.5 text-[12.5px]">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="font-medium text-foreground">{a.t}</span>
                <span className="text-muted-foreground">· {a.who}</span>
                <span className="ml-auto text-muted-foreground">{a.time}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
