import { useEffect, useMemo, useState } from "react";
import { Save, Copy, Sparkles, TrendingUp, TrendingDown, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const Calculator = () => {
  const { user } = useAuth();
  const [billAmount, setBillAmount] = useState("64962");
  const [billDiscount, setBillDiscount] = useState("22");
  const [requiredDiscount, setRequiredDiscount] = useState("24");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Calculator — RD Calculator Pro";
  }, []);

  const calc = useMemo(() => {
    const bill = parseFloat(billAmount) || 0;
    const bDisc = parseFloat(billDiscount) || 0;
    const rDisc = parseFloat(requiredDiscount) || 0;
    const billOnMrp = bDisc < 100 ? bill / (1 - bDisc / 100) : 0;
    const afterRd = billOnMrp * (1 - rDisc / 100);
    const rdAmount = afterRd - bill;
    const extraNeeded = bill > 0 && billOnMrp > 0 ? ((billOnMrp - bill) / billOnMrp) * 100 : 0;
    return { bill, bDisc, rDisc, billOnMrp, afterRd, rdAmount, extraNeeded };
  }, [billAmount, billDiscount, requiredDiscount]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("calculations").insert({
      user_id: user.id,
      bill_amount: calc.bill,
      bill_discount: calc.bDisc,
      required_discount: calc.rDisc,
      bill_on_mrp: Math.round(calc.billOnMrp),
      after_rd: Math.round(calc.afterRd),
      rd_amount: Math.round(calc.rdAmount),
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Calculation saved");
  };

  const handleCopy = async () => {
    const text = `Final Payable: ₹${fmt(calc.afterRd)}\nBill on MRP: ₹${fmt(calc.billOnMrp)}\nRD Amount: ₹${fmt(calc.rdAmount)}`;
    await navigator.clipboard.writeText(text);
    toast.success("Result copied to clipboard");
  };

  const isNegative = calc.rdAmount < 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Calculator</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Rate Difference</h1>
          <p className="text-muted-foreground mt-1">Real-time calculation. No submit needed.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant">
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </header>

      {/* Hero result */}
      <div className="relative overflow-hidden rounded-2xl gradient-success p-8 md:p-10 text-white shadow-elegant animate-scale-in">
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 20% 50%, white, transparent 50%)" }} />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium uppercase tracking-wider">
            <Sparkles className="h-4 w-4" /> Final Payable Amount
          </div>
          <div className="font-display text-5xl md:text-7xl font-bold mt-3 tabular-nums">
            ₹{fmt(calc.afterRd)}
          </div>
          <div className="mt-3 text-white/90 text-sm">
            on a bill of ₹{fmt(calc.bill)} — {calc.rDisc}% required discount
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid md:grid-cols-3 gap-4">
        <InputCard
          label="Bill Amount"
          value={billAmount}
          onChange={setBillAmount}
          accent="from-primary/20 to-primary/5"
          prefix="₹"
        />
        <InputCard
          label="Bill Discount"
          value={billDiscount}
          onChange={setBillDiscount}
          accent="from-accent/20 to-accent/5"
          suffix="%"
        />
        <InputCard
          label="Required Discount"
          value={requiredDiscount}
          onChange={setRequiredDiscount}
          accent="from-primary-glow/20 to-primary-glow/5"
          suffix="%"
        />
      </div>

      {/* Computed results */}
      <div className="grid md:grid-cols-3 gap-4">
        <ResultCard label="Bill on MRP" value={`₹${fmt(calc.billOnMrp)}`} subtle />
        <ResultCard label="After RD" value={`₹${fmt(calc.afterRd)}`} tone="success" />
        <ResultCard
          label="RD Amount"
          value={`${isNegative ? "-" : "+"}₹${fmt(Math.abs(calc.rdAmount))}`}
          tone={isNegative ? "destructive" : "warning"}
          icon={isNegative ? TrendingDown : TrendingUp}
        />
      </div>

      {/* Insight */}
      <div className="glass rounded-2xl p-6 flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-display font-semibold">Auto Insight</h3>
          {isNegative ? (
            <p className="text-sm text-muted-foreground mt-1">
              You're short by <span className="font-semibold text-destructive">₹{fmt(Math.abs(calc.rdAmount))}</span>.
              You need approximately <span className="font-semibold text-foreground">{calc.extraNeeded.toFixed(2)}%</span> total
              discount to match this bill amount.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Excellent — you have a surplus of <span className="font-semibold text-success">₹{fmt(calc.rdAmount)}</span> that can
              be adjusted on this bill.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const InputCard = ({
  label, value, onChange, accent, prefix, suffix,
}: { label: string; value: string; onChange: (v: string) => void; accent: string; prefix?: string; suffix?: string }) => (
  <div className={cn("rounded-2xl p-5 bg-card border border-border shadow-soft transition-smooth hover:shadow-elegant hover:-translate-y-0.5 bg-gradient-to-br", accent)}>
    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</Label>
    <div className="flex items-center gap-2 mt-2">
      {prefix && <span className="text-2xl font-display font-semibold text-muted-foreground">{prefix}</span>}
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="border-0 bg-transparent text-2xl font-display font-bold p-0 h-auto focus-visible:ring-0 tabular-nums"
      />
      {suffix && <span className="text-2xl font-display font-semibold text-muted-foreground">{suffix}</span>}
    </div>
  </div>
);

const ResultCard = ({
  label, value, tone, subtle, icon: Icon,
}: { label: string; value: string; tone?: "success" | "destructive" | "warning"; subtle?: boolean; icon?: any }) => {
  const toneClass = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-2xl p-5 bg-card border border-border shadow-soft transition-smooth hover:shadow-elegant">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4", toneClass)} />}
      </div>
      <div className={cn("font-display text-3xl font-bold mt-2 tabular-nums", subtle ? "text-foreground" : toneClass)}>
        {value}
      </div>
    </div>
  );
};

export default Calculator;
