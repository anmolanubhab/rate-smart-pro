import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  FilePlus,
  Receipt,
  Scale,
  FileText,
  TruckIcon,
  Settings as SettingsIcon,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchGstRegistrations } from "@/lib/gstRegistrations";
import { fetchGstComplianceConfig } from "@/lib/accountingLock";

const fmtInr = (n: number) =>
  `₹ ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n))}`;

const toneClass = (tone: "default" | "warning" | "danger" | "success") => {
  if (tone === "success") return "text-emerald-600";
  if (tone === "warning") return "text-amber-600";
  if (tone === "danger") return "text-destructive";
  return "text-foreground";
};

const toneBg = (tone: "default" | "warning" | "danger" | "success") => {
  if (tone === "success") return "bg-emerald-500/10 text-emerald-600";
  if (tone === "warning") return "bg-amber-500/10 text-amber-600";
  if (tone === "danger") return "bg-destructive/10 text-destructive";
  return "bg-primary/10 text-primary";
};

const quickLinks = [
  { label: "GST Filing", icon: FilePlus, href: "/gst/filing", desc: "Prepare & file GSTR-1/3B" },
  { label: "GSTR-3B", icon: Scale, href: "/gst/gstr-3b", desc: "Liability vs ITC, net payable" },
  { label: "GSTR-1", icon: Receipt, href: "/gst/gstr-1", desc: "Invoice-wise outward supplies" },
  { label: "e-Invoice Register", icon: FileText, href: "/gst/einvoice-register", desc: "IRN status across invoices" },
  { label: "e-Way Bill Register", icon: TruckIcon, href: "/gst/ewaybill-register", desc: "Validity across invoices" },
  { label: "GST Configuration", icon: SettingsIcon, href: "/gst/configuration", desc: "GSTIN, e-Invoice/e-Way, HSN" },
];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export default function GstDashboard() {
  useEffect(() => { document.title = "GST Dashboard — RD Pro"; }, []);
  const { business } = useBusiness();
  const businessId = business?.id;

  const { data: registrations } = useQuery({
    queryKey: ["gst-dashboard-registrations", businessId],
    enabled: !!businessId,
    queryFn: () => fetchGstRegistrations(businessId!),
  });
  const primaryGstin = registrations?.find((r) => r.is_primary) ?? registrations?.[0] ?? null;

  const { data: config } = useQuery({
    queryKey: ["gst-dashboard-config", businessId],
    enabled: !!businessId,
    queryFn: () => fetchGstComplianceConfig(businessId!),
  });

  // Six-month window (current month + 5 preceding), output tax vs ITC, from
  // the same per-line CGST/SGST/IGST split used at posting time (Gstr3B.tsx's
  // approach) — grouped by invoice month instead of a single period.
  const { data: trend, isLoading, isError, error: trendError } = useQuery({
    queryKey: ["gst-dashboard-trend", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const now = new Date();
      const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const from = windowStart.toISOString().slice(0, 10);

      const [salesRes, purchaseRes] = await Promise.all([
        supabase.from("sales_invoices").select("id, invoice_date")
          .eq("business_id", businessId!).eq("status", "posted").gte("invoice_date", from),
        supabase.from("purchase_invoices").select("id, invoice_date")
          .eq("business_id", businessId!).neq("status", "cancelled").gte("invoice_date", from),
      ]);
      if (salesRes.error) throw salesRes.error;
      if (purchaseRes.error) throw purchaseRes.error;

      const salesMonthById = new Map((salesRes.data ?? []).map((i: any) => [i.id, monthKey(new Date(i.invoice_date))]));
      const purchaseMonthById = new Map((purchaseRes.data ?? []).map((i: any) => [i.id, monthKey(new Date(i.invoice_date))]));

      const months: string[] = [];
      for (let i = 5; i >= 0; i--) months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
      const byMonth = new Map(months.map((m) => [m, { output: 0, itc: 0 }]));

      const salesIds = Array.from(salesMonthById.keys());
      if (salesIds.length) {
        const { data: items, error: itemsErr } = await supabase
          .from("sales_invoice_items")
          .select("invoice_id, cgst_amount, sgst_amount, igst_amount")
          .in("invoice_id", salesIds);
        if (itemsErr) throw itemsErr;
        for (const it of items ?? []) {
          const m = salesMonthById.get((it as any).invoice_id);
          const bucket = m ? byMonth.get(m) : undefined;
          if (bucket) bucket.output += (Number((it as any).cgst_amount) || 0) + (Number((it as any).sgst_amount) || 0) + (Number((it as any).igst_amount) || 0);
        }
      }

      const purchaseIds = Array.from(purchaseMonthById.keys());
      if (purchaseIds.length) {
        const { data: items, error: itemsErr } = await supabase
          .from("purchase_invoice_items")
          .select("purchase_invoice_id, cgst_amount, sgst_amount, igst_amount")
          .in("purchase_invoice_id", purchaseIds);
        if (itemsErr) throw itemsErr;
        for (const it of items ?? []) {
          const m = purchaseMonthById.get((it as any).purchase_invoice_id);
          const bucket = m ? byMonth.get(m) : undefined;
          if (bucket) bucket.itc += (Number((it as any).cgst_amount) || 0) + (Number((it as any).sgst_amount) || 0) + (Number((it as any).igst_amount) || 0);
        }
      }

      return months.map((m) => {
        const b = byMonth.get(m)!;
        return {
          month: monthLabel(m),
          output: Math.round(b.output),
          itc: Math.round(b.itc),
          net: Math.round(Math.max(b.output - b.itc, 0)),
        };
      });
    },
  });

  const current = trend?.[trend.length - 1];

  const kpis = useMemo(() => [
    {
      label: "Output Tax", value: fmtInr(current?.output ?? 0),
      sub: "This month", icon: Receipt, tone: "default" as const, href: "/gst/gstr-3b",
    },
    {
      label: "Input Tax Credit", value: fmtInr(current?.itc ?? 0),
      sub: "This month", icon: Scale, tone: "success" as const, href: "/gst/gstr-3b",
    },
    {
      label: "Net Payable", value: fmtInr(current?.net ?? 0),
      sub: "Output − ITC, this month", icon: Activity, tone: "danger" as const, href: "/gst/gstr-3b",
    },
    {
      label: "GSTIN", value: primaryGstin?.gstin ?? "Not set",
      sub: primaryGstin ? "Primary registration" : "Configure to enable filing", icon: SettingsIcon,
      tone: primaryGstin ? "success" as const : "warning" as const, href: "/gst/configuration",
    },
  ], [current, primaryGstin]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">GST & Compliance</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">GST Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Output tax, input tax credit and net payable at a glance, across the last six months.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild>
            <Link to="/gst/filing">
              <FilePlus className="h-4 w-4 mr-2" />
              Prepare Return
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            to={k.href}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {k.label}
              </p>
              <div className={`rounded-lg p-1.5 ${toneBg(k.tone)}`}>
                <k.icon className="h-3.5 w-3.5" />
              </div>
            </div>
            <p className={`font-display text-2xl font-bold tabular-nums ${toneClass(k.tone)}`}>
              {isLoading && k.label !== "GSTIN" ? "…" : isError && k.label !== "GSTIN" ? "—" : k.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
        <div className="mb-4">
          <h3 className="font-display font-semibold">Output Tax vs ITC</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Last 6 months, from posted sales and purchase invoices</p>
        </div>
        {isLoading ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : isError ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-destructive">
            Could not load GST trend data: {(trendError as Error)?.message ?? "unknown error"}
          </div>
        ) : trend && trend.some((m) => m.output || m.itc) ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => fmtInr(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="output" name="Output Tax" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="itc" name="Input Tax Credit" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
            No posted invoices in the last 6 months yet.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center gap-4">
        {config ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              {config.enable_einvoice ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-muted-foreground" />}
              e-Invoice <Badge variant="outline" className="text-[10px]">{config.enable_einvoice ? "Enabled" : "Disabled"}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {config.enable_ewaybill ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-muted-foreground" />}
              e-Way Bill <Badge variant="outline" className="text-[10px]">{config.enable_ewaybill ? "Enabled" : "Disabled"}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              Return frequency <Badge variant="outline" className="text-[10px] capitalize">{config.gst_return_frequency}</Badge>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">GST compliance settings aren't configured yet.</p>
        )}
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <Link to="/gst/configuration">
            Configure <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((q) => (
            <Link
              key={q.label}
              to={q.href}
              className="rounded-2xl border border-border bg-card p-5 flex items-start gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
            >
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary shrink-0">
                <q.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                  {q.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{q.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
