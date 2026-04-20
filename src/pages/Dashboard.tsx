import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator as CalcIcon, TrendingUp, Activity, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Calc = {
  id: string;
  bill_amount: number;
  bill_discount: number;
  required_discount: number;
  after_rd: number;
  rd_amount: number;
  created_at: string;
};

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const Dashboard = () => {
  const { user } = useAuth();
  const [calcs, setCalcs] = useState<Calc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Dashboard — RD Calculator Pro";
    if (!user) return;
    supabase
      .from("calculations")
      .select("id, bill_amount, bill_discount, required_discount, after_rd, rd_amount, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setCalcs(data ?? []);
        setLoading(false);
      });
  }, [user]);

  const totalRd = calcs.reduce((s, c) => s + Number(c.rd_amount), 0);
  const latest = calcs[0];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Welcome back</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">{user?.email?.split("@")[0]}</h1>
          <p className="text-muted-foreground mt-1">Here's an overview of your activity.</p>
        </div>
        <Button asChild className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant">
          <Link to="/calculator"><CalcIcon className="h-4 w-4" /> New calculation</Link>
        </Button>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <StatCard
          label="Total Calculations"
          value={loading ? "—" : String(calcs.length)}
          icon={Activity}
          accent="gradient-primary"
        />
        <StatCard
          label={totalRd >= 0 ? "Total Profit" : "Total Loss"}
          value={loading ? "—" : `${totalRd >= 0 ? "+" : "-"}₹${fmt(Math.abs(totalRd))}`}
          icon={TrendingUp}
          accent={totalRd >= 0 ? "gradient-success" : "bg-destructive"}
        />
        <StatCard
          label="Latest Bill"
          value={latest ? `₹${fmt(Number(latest.bill_amount))}` : "—"}
          icon={Sparkles}
          accent="gradient-accent"
        />
      </div>

      <section className="rounded-2xl bg-card border border-border shadow-soft p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">Recent calculations</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/history">View all <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : calcs.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-muted items-center justify-center mb-3">
              <CalcIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No calculations yet.</p>
            <Button asChild className="mt-4">
              <Link to="/calculator">Create your first one</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {calcs.slice(0, 5).map((c) => {
              const neg = Number(c.rd_amount) < 0;
              return (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div>
                    <div className="font-medium tabular-nums">₹{fmt(Number(c.bill_amount))}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.bill_discount}% → {c.required_discount}% • {new Date(c.created_at).toLocaleDateString()}
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
    <div className="font-display text-3xl font-bold mt-1 tabular-nums">{value}</div>
  </div>
);

export default Dashboard;
