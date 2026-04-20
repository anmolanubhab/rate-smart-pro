import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calculator as CalcIcon, TrendingUp, Activity, ArrowRight, Sparkles,
  Percent, Wallet,
} from "lucide-react";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Calc = {
  id: string;
  bill_amount: number;
  bill_discount: number;
  required_discount: number;
  after_rd: number;
  rd_amount: number;
  party_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  created_at: string;
};

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const Dashboard = () => {
  const { user } = useAuth();
  const [calcs, setCalcs] = useState<Calc[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [party, setParty] = useState("all");

  useEffect(() => {
    document.title = "Dashboard — RD Calculator Pro";
    if (!user) return;
    supabase
      .from("calculations")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setCalcs((data as Calc[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  const parties = useMemo(() => {
    const set = new Set<string>();
    calcs.forEach((c) => c.party_name && set.add(c.party_name));
    return Array.from(set).sort();
  }, [calcs]);

  const filtered = useMemo(() => {
    return calcs.filter((c) => {
      const t = new Date(c.created_at).getTime();
      if (from && t < new Date(from).getTime()) return false;
      if (to && t > new Date(to).getTime() + 86400000) return false;
      if (party !== "all" && (c.party_name || "") !== party) return false;
      return true;
    });
  }, [calcs, from, to, party]);

  const totalRd = filtered.reduce((s, c) => s + Number(c.rd_amount), 0);
  const totalPayable = filtered.reduce((s, c) => s + Number(c.after_rd), 0);
  const avgDiscount = filtered.length
    ? filtered.reduce((s, c) => s + Number(c.required_discount), 0) / filtered.length
    : 0;
  const latest = filtered[0];

  // Trend (last 30 entries chronologically)
  const trend = useMemo(() => {
    return [...filtered]
      .reverse()
      .slice(-30)
      .map((c) => ({
        date: format(new Date(c.created_at), "dd MMM"),
        rd: Math.round(Number(c.rd_amount)),
        payable: Math.round(Number(c.after_rd)),
      }));
  }, [filtered]);

  // Party-wise RD
  const partyData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => {
      const name = c.party_name || "Unassigned";
      map.set(name, (map.get(name) || 0) + Number(c.rd_amount));
    });
    return Array.from(map.entries())
      .map(([name, rd]) => ({ name, rd: Math.round(rd) }))
      .sort((a, b) => Math.abs(b.rd) - Math.abs(a.rd))
      .slice(0, 8);
  }, [filtered]);

  // Monthly counts (last 6 months)
  const monthly = useMemo(() => {
    const buckets: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      buckets.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM"), count: 0 });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    filtered.forEach((c) => {
      const k = format(new Date(c.created_at), "yyyy-MM");
      const i = idx.get(k);
      if (i !== undefined) buckets[i].count += 1;
    });
    return buckets;
  }, [filtered]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Welcome back</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">{user?.email?.split("@")[0]}</h1>
          <p className="text-muted-foreground mt-1">Business analytics across your calculations.</p>
        </div>
        <Button asChild className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant">
          <Link to="/calculator"><CalcIcon className="h-4 w-4" /> New calculation</Link>
        </Button>
      </header>

      {/* Filters */}
      <div className="rounded-2xl bg-card border border-border shadow-soft p-4 grid md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Party</Label>
          <select
            value={party}
            onChange={(e) => setParty(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">All parties</option>
            {parties.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Calculations" value={loading ? "—" : String(filtered.length)} icon={Activity} accent="gradient-primary" />
        <StatCard
          label={totalRd >= 0 ? "Total Profit" : "Total Loss"}
          value={loading ? "—" : `${totalRd >= 0 ? "+" : "-"}₹${fmt(Math.abs(totalRd))}`}
          icon={TrendingUp}
          accent={totalRd >= 0 ? "gradient-success" : "bg-destructive"}
        />
        <StatCard label="Avg Discount" value={loading ? "—" : `${avgDiscount.toFixed(1)}%`} icon={Percent} accent="gradient-accent" />
        <StatCard label="Total Payable" value={loading ? "—" : `₹${fmt(totalPayable)}`} icon={Wallet} accent="gradient-primary" />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="RD Trend" subtitle="Latest 30 calculations">
          {trend.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => `₹${fmt(v)}`}
                />
                <Line type="monotone" dataKey="rd" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Party-wise RD" subtitle="Top 8 by absolute value">
          {partyData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={partyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => `₹${fmt(v)}`}
                />
                <Bar dataKey="rd" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly Calculations" subtitle="Last 6 months" wide>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Recent */}
      <section className="rounded-2xl bg-card border border-border shadow-soft p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Recent calculations</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/history">View all <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-muted items-center justify-center mb-3">
              <CalcIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No calculations match your filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, 5).map((c) => {
              const neg = Number(c.rd_amount) < 0;
              return (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div>
                    <div className="font-medium tabular-nums">
                      ₹{fmt(Number(c.bill_amount))}
                      {c.party_name && <span className="ml-2 text-xs font-normal text-muted-foreground">· {c.party_name}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.bill_discount}% → {c.required_discount}% • {new Date(c.created_at).toLocaleDateString()}
                      {c.invoice_number && <> • {c.invoice_number}</>}
                    </div>
                  </div>
                  <div className={cn("font-semibold tabular-nums", neg ? "text-destructive" : "text-success")}>
                    {neg ? "-" : "+"}₹{fmt(Math.abs(Number(c.rd_amount)))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent: string }) => (
  <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-6 shadow-soft transition-smooth hover:shadow-elegant hover:-translate-y-1">
    <div className={cn("absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-20 blur-2xl", accent)} />
    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-soft", accent)}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
    <div className="font-display text-2xl md:text-3xl font-bold mt-1 tabular-nums">{value}</div>
  </div>
);

const ChartCard = ({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) => (
  <div className={cn("rounded-2xl bg-card border border-border shadow-soft p-5", wide && "lg:col-span-2")}>
    <div className="mb-4">
      <h3 className="font-display font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const Empty = () => (
  <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
    No data yet for selected filters.
  </div>
);

export default Dashboard;
