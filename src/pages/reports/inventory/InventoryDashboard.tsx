// src/pages/reports/inventory/InventoryDashboard.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, TrendingDown, TrendingUp, AlertTriangle, Archive,
  Zap, Clock, XCircle, BarChart3, Activity, ArrowRight,
} from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { fetchInventoryDashboard, InventoryDashboardData, fmtInr } from "@/lib/inventoryReports";

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default"|"success"|"warning"|"danger";
  onClick?: () => void;
}

function KpiCard({ icon, label, value, sub, tone="default", onClick }: KpiCardProps) {
  const toneClasses = {
    default: "bg-card border-border text-foreground",
    success: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800",
    warning: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
    danger:  "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800",
  };
  const valClasses = {
    default: "text-foreground",
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger:  "text-rose-700 dark:text-rose-400",
  };

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border p-5 shadow-soft transition-all ${toneClasses[tone]} ${onClick?"cursor-pointer hover:shadow-md hover:-translate-y-0.5":""}`}
    >
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-xl bg-background/60 flex items-center justify-center">{icon}</div>
        {onClick && <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />}
      </div>
      <p className={`font-display text-3xl font-bold mt-3 tabular-nums ${valClasses[tone]}`}>{value.toLocaleString("en-IN")}</p>
      <p className="text-sm font-semibold text-foreground mt-1">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function InventoryDashboard() {
  const { business } = useBusiness();
  const navigate     = useNavigate();
  const [data, setData]     = useState<InventoryDashboardData|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string|null>(null);

  useEffect(() => { document.title = "Inventory Dashboard — RD Pro"; }, []);
  useEffect(() => {
    if (!business?.id) return;
    setLoading(true); setError(null);
    fetchInventoryDashboard(business.id)
      .then(setData).catch((e)=>setError(e.message)).finally(()=>setLoading(false));
  }, [business?.id]);

  const go = (path:string) => navigate(path);

  const QUICK_LINKS = [
    { label:"Stock Summary",      route:"/reports/inventory/stock-summary",       icon:<Package className="h-4 w-4" />,       desc:"Opening/Closing with drill-down" },
    { label:"Stock Movement",     route:"/reports/inventory/movement-register",   icon:<Activity className="h-4 w-4" />,      desc:"All inflows and outflows" },
    { label:"Stock Ageing",       route:"/reports/inventory/stock-ageing",        icon:<Clock className="h-4 w-4" />,         desc:"Days since last movement" },
    { label:"Dead Stock",         route:"/reports/inventory/dead-stock",          icon:<AlertTriangle className="h-4 w-4" />, desc:"Idle stock report" },
    { label:"ABC Analysis",       route:"/reports/inventory/abc-analysis",        icon:<BarChart3 className="h-4 w-4" />,     desc:"Pareto classification" },
    { label:"FSN Analysis",       route:"/reports/inventory/fsn-analysis",        icon:<Zap className="h-4 w-4" />,           desc:"Fast/Slow/Non-moving" },
    { label:"Stock Valuation",    route:"/reports/inventory/stock-valuation",     icon:<Archive className="h-4 w-4" />,       desc:"Cost, MRP & Sale value" },
    { label:"Group Summary",      route:"/reports/inventory/group-summary",       icon:<BarChart3 className="h-4 w-4" />,     desc:"By product group" },
    { label:"Category Summary",   route:"/reports/inventory/category-summary",   icon:<BarChart3 className="h-4 w-4" />,     desc:"By category" },
    { label:"Warehouse Summary",  route:"/reports/inventory/warehouse-summary",  icon:<Archive className="h-4 w-4" />,       desc:"Per warehouse location" },
  ];

  if (loading) return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in-up">
      <div className="h-10 w-64 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({length:8}).map((_,i)=><div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground font-medium">Inventory Reports</p>
        <h1 className="font-display text-3xl font-bold mt-1 flex items-center gap-2">
          <Package className="h-7 w-7 text-primary" /> Inventory Dashboard
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Live stock health overview for <b>{business?.business_name}</b>
        </p>
      </header>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {data && (
        <>
          {/* Value KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary/70">Total Stock Value (Cost)</p>
              <p className="font-display text-4xl font-bold mt-2 text-primary tabular-nums">{fmtInr(data.total_stock_value)}</p>
            </div>
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-6 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Total MRP Value</p>
              <p className="font-display text-4xl font-bold mt-2 text-blue-700 dark:text-blue-400 tabular-nums">{fmtInr(data.total_mrp_value)}</p>
            </div>
          </div>

          {/* Stock Status KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard icon={<TrendingUp className="h-5 w-5 text-emerald-600"/>} label="Positive Stock" value={data.positive_stock} tone="success" onClick={()=>go("/reports/inventory/stock-summary?filter=positive")} />
            <KpiCard icon={<XCircle className="h-5 w-5 text-muted-foreground"/>} label="Zero Stock" value={data.zero_stock} onClick={()=>go("/reports/inventory/stock-summary?filter=zero")} />
            <KpiCard icon={<TrendingDown className="h-5 w-5 text-rose-600"/>} label="Negative Stock" value={data.negative_stock} tone={data.negative_stock>0?"danger":"default"} onClick={()=>go("/reports/inventory/stock-summary?filter=negative")} />
            <KpiCard icon={<AlertTriangle className="h-5 w-5 text-amber-600"/>} label="Low Stock" value={data.low_stock} tone={data.low_stock>0?"warning":"default"} sub="Below reorder point" />
          </div>

          {/* Analytics KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard icon={<Archive className="h-5 w-5 text-rose-600"/>} label="Dead Stock" value={data.dead_stock} tone={data.dead_stock>0?"danger":"default"} sub="No movement 180+ days" onClick={()=>go("/reports/inventory/dead-stock")} />
            <KpiCard icon={<Zap className="h-5 w-5 text-emerald-600"/>} label="Fast Moving" value={data.fast_moving} tone="success" sub="F-class products" onClick={()=>go("/reports/inventory/fsn-analysis")} />
            <KpiCard icon={<Clock className="h-5 w-5 text-amber-600"/>} label="Non-Moving" value={data.non_moving} tone="warning" sub="N-class products" onClick={()=>go("/reports/inventory/fsn-analysis")} />
          </div>

          {/* Insights */}
          {(data.top_brand || data.top_category) && (
            <div className="grid md:grid-cols-2 gap-4">
              {data.top_brand && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Top Brand</p>
                  <p className="font-display text-2xl font-bold mt-2">{data.top_brand}</p>
                </div>
              )}
              {data.top_category && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Top Category</p>
                  <p className="font-display text-2xl font-bold mt-2 capitalize">{data.top_category}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Inventory Reports</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {QUICK_LINKS.map(l=>(
            <button
              key={l.route}
              onClick={()=>navigate(l.route)}
              className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/30 hover:bg-primary/5 transition-all shadow-soft group"
            >
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                {l.icon}
              </div>
              <p className="font-semibold text-sm text-foreground">{l.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{l.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
