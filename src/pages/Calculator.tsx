import { useEffect, useMemo, useState } from "react";
import { 
  Save, Copy, Sparkles, TrendingUp, TrendingDown, 
  Info, FileText, Share2, ChevronDown, FileDown, 
  Users, Tag, Wand2 
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { generateInvoicePdf, shareOnWhatsApp, fmtINR } from "@/lib/invoice";
import { fetchParties, fetchSegments, fetchPartyDiscounts, resolveDiscount, Party, Segment, PartyDiscount } from "@/lib/parties";

// ==========================================
// TYPES & INTERFACES
// ==========================================
interface InputCardProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent: string;
  prefix?: string;
  suffix?: string;
  helper?: string;
}

interface ResultCardProps {
  label: string;
  value: string;
  tone?: "success" | "destructive" | "warning";
  subtle?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

interface PartySummaryStatProps {
  label: string;
  value: string;
  tone?: "success";
}

// ==========================================
// MAIN CALCULATOR COMPONENT
// ==========================================
const Calculator = () => {
  const { user } = useAuth();
  
  // Input States
  const [billAmount, setBillAmount] = useState("");
  const [billDiscount, setBillDiscount] = useState("22");
  const [requiredDiscount, setRequiredDiscount] = useState("24");
  const [cdDiscount, setCdDiscount] = useState("0");
  const [partyName, setPartyName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  
  // UI States
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Master Data States
  const [parties, setParties] = useState<Party[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [partyId, setPartyId] = useState<string>("");
  const [segmentId, setSegmentId] = useState<string>("");
  const [partyDiscounts, setPartyDiscounts] = useState<PartyDiscount[]>([]);
  const [autoApplied, setAutoApplied] = useState<"segment" | "agreed" | "default" | null>(null);

  // Memoized Selectors
  const selectedParty = useMemo(() => parties.find((p) => p.id === partyId) || null, [parties, partyId]);
  const mode = selectedParty?.discount_type ?? null; // "RD" | "CD" | null

  // Meta Title & Initial Fetch
  useEffect(() => {
    document.title = "Calculator — RD Calculator Pro";
    if (!user) return;

    let isMounted = true;
    (async () => {
      try {
        const [fetchedParties, fetchedSegments] = await Promise.all([
          fetchParties(user.id),
          fetchSegments()
        ]);
        if (isMounted) {
          setParties(fetchedParties);
          setSegments(fetchedSegments);
        }
      } catch (e: any) {
        if (isMounted) toast.error(e.message || "Failed to fetch master data");
      }
    })();

    return () => { isMounted = false; };
  }, [user]);

  // Party Switch Automation
  useEffect(() => {
    if (!selectedParty) {
      setPartyDiscounts([]);
      setAutoApplied(null);
      setCdDiscount("0");
      setPartyName("");
      return;
    }

    setPartyName(selectedParty.name);
    setBillDiscount(String(selectedParty.default_discount));
    setPartyDiscounts([]);
    
    let isMounted = true;
    (async () => {
      try {
        const pd = await fetchPartyDiscounts(selectedParty.id);
        if (isMounted) setPartyDiscounts(pd);
      } catch (e: any) {
        if (isMounted) toast.error(e.message || "Failed to fetch discounts");
      }
    })();

    return () => { isMounted = false; };
  }, [selectedParty]);

  // Resolution Logic for Discounts
  useEffect(() => {
    if (!selectedParty) return;
    
    const { value, source } = resolveDiscount(selectedParty, segmentId || null, partyDiscounts);
    setAutoApplied(source);

    if (selectedParty.discount_type === "RD") {
      setRequiredDiscount(String(value));
    } else {
      const base = Number(selectedParty.default_discount) || 0;
      const committed = source === "segment" ? Math.max(base, Number(value) || 0) : base;
      const cdPct = Math.max(0, committed - base);
      
      setRequiredDiscount(String(Math.round(committed * 100) / 100));
      setCdDiscount(String(Math.round(cdPct * 100) / 100));
    }
  }, [selectedParty, segmentId, partyDiscounts]);

  // CD Summary Calculations
  const cdPartySummary = useMemo(() => {
    if (!selectedParty || selectedParty.discount_type !== "CD") return null;

    const base = Number(selectedParty.default_discount) || 0;
    const segmentValue = segmentId
      ? partyDiscounts.find((d) => d.segment_id === segmentId)?.discount ?? null
      : null;
    const committed = segmentValue === null ? base : Math.max(base, Number(segmentValue) || 0);
    const cd = Math.max(0, committed - base);

    return {
      base,
      cd: Math.round(cd * 100) / 100,
      committed: Math.round(committed * 100) / 100,
    };
  }, [selectedParty, segmentId, partyDiscounts]);

  // Core Math Engine
  const calc = useMemo(() => {
    const bill = parseFloat(billAmount) || 0;
    const bDisc = parseFloat(billDiscount) || 0;
    const rDisc = parseFloat(requiredDiscount) || 0;
    const cd = parseFloat(cdDiscount) || 0;

    const billOnMrp = bDisc < 100 ? bill / (1 - bDisc / 100) : 0;

    // RD Calculations
    const afterRd = billOnMrp * (1 - rDisc / 100);
    const rdAmount = afterRd - bill;

    // CD Calculations (Sequential)
    const cdNetAmount = bill * (1 - bDisc / 100);
    const cdAmount = cdNetAmount * (cd / 100);
    const afterCd = cdNetAmount - cdAmount;
    const cdEffective = bill > 0 ? ((bill - afterCd) / bill) * 100 : 0;

    // Extras
    const agreedDiff = selectedParty?.discount_type === "RD"
      ? Number(selectedParty.agreed_discount) - bDisc
      : 0;
    const extraNeeded = bill > 0 && billOnMrp > 0 ? ((billOnMrp - bill) / billOnMrp) * 100 : 0;

    const isCd = mode === "CD";
    const finalPayable = isCd ? afterCd : afterRd;
    const totalBenefit = isCd ? (bill - afterCd) : -rdAmount;

    return { 
      bill, bDisc, rDisc, cd, billOnMrp, afterRd, rdAmount, 
      cdNetAmount, cdAmount, afterCd, cdEffective, agreedDiff, 
      extraNeeded, finalPayable, totalBenefit 
    };
  }, [billAmount, billDiscount, requiredDiscount, cdDiscount, mode, selectedParty]);

  // Context-Aware Payload Creation
  const payload = useMemo(() => ({
    partyName: partyName.trim() || null,
    invoiceDate: invoiceDate || null,
    invoiceNumber: invoiceNumber.trim() || null,
    billAmount: calc.bill,
    billDiscount: calc.bDisc,
    requiredDiscount: calc.rDisc,
    billOnMrp: Math.round(calc.billOnMrp),
    afterRd: Math.round(mode === "CD" ? calc.afterCd : calc.afterRd),
    rdAmount: Math.round(mode === "CD" ? -calc.cdAmount : calc.rdAmount),
  }), [partyName, invoiceDate, invoiceNumber, calc, mode]);

  // Callbacks / Action Handlers
  const handleSave = async () => {
    if (!user) return;
    if (!calc.bill) return toast.error("Enter bill amount first");
    
    setSaving(true);
    try {
      const { error } = await supabase.from("calculations").insert({
        user_id: user.id,
        business_id: (typeof window !== "undefined" ? localStorage.getItem("rdpro.activeBusinessId") : null),
        bill_amount: calc.bill,
        bill_discount: calc.bDisc,
        required_discount: calc.rDisc,
        bill_on_mrp: payload.billOnMrp,
        after_rd: payload.afterRd,
        rd_amount: payload.rdAmount,
        party_name: payload.partyName,
        invoice_date: payload.invoiceDate,
        invoice_number: payload.invoiceNumber,
        party_id: partyId || null,
        segment_id: segmentId || null,
        mode: mode,
        cd_discount: mode === "CD" ? calc.cd : null,
        total_benefit: Math.round(calc.totalBenefit),
      });

      if (error) throw error;
      toast.success("Calculation saved successfully");
    } catch (e: any) {
      toast.error(e.message || "Failed to save calculation");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    const text = `Final Payable: ₹${fmtINR(calc.finalPayable)}\nBill on MRP: ₹${fmtINR(calc.billOnMrp)}\n${
      mode === "CD" ? `CD Amount: ₹${fmtINR(calc.cdAmount)}` : `RD Amount: ₹${fmtINR(calc.rdAmount)}`
    }`;
    await navigator.clipboard.writeText(text);
    toast.success("Result copied to clipboard");
  };

  const handlePdf = () => {
    generateInvoicePdf(payload);
    toast.success("Invoice PDF generated");
  };

  const handleShare = () => shareOnWhatsApp(payload);

  const isNegative = mode === "CD" ? false : calc.rdAmount < 0;
  const hasInvoiceData = !!(payload.partyName || payload.invoiceDate || payload.invoiceNumber);
  const billEmpty = !billAmount || parseFloat(billAmount) === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      {/* Top Header Row */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Calculator</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Rate Difference</h1>
          <p className="text-muted-foreground mt-1">Real-time calculation with party & segment automation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-1" /> Copy
          </Button>
          <Button variant="outline" onClick={handlePdf}>
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button 
            variant="outline" 
            onClick={handleShare} 
            className="border-success/30 text-success hover:bg-success/10 hover:text-success"
          >
            <Share2 className="h-4 w-4 mr-1" /> WhatsApp
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving} 
            className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant"
          >
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </header>

      {/* Hero Display Card */}
      <div className="relative overflow-hidden rounded-2xl gradient-success p-8 md:p-10 text-white shadow-elegant animate-scale-in">
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 20% 50%, white, transparent 50%)" }} />
        <div className="relative">
          <div className="flex items-center gap-2 text-white/80 text-sm font-medium uppercase tracking-wider">
            <Sparkles className="h-4 w-4" /> Final Payable Amount
            {mode && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                {mode} MODE
              </span>
            )}
          </div>
          <div className="font-display text-5xl md:text-7xl font-bold mt-3 tabular-nums">
            ₹{fmtINR(calc.finalPayable)}
          </div>
          <div className="mt-3 text-white/90 text-sm">
            on a bill of ₹{fmtINR(calc.bill)} — {mode === "CD" ? `${calc.bDisc}% + ${calc.cd}% (CD)` : `${calc.rDisc}% required discount`}
          </div>
        </div>
      </div>

      {/* Profile: Party & Segment Configurer */}
      <div className="rounded-2xl p-5 md:p-6 bg-card border border-border shadow-soft bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Party & Segment</h3>
              <p className="text-xs text-muted-foreground">Auto-fill discount based on your saved rules</p>
            </div>
          </div>
          {selectedParty && (
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                selectedParty.discount_type === "RD"
                  ? "border-primary/30 text-primary bg-primary/5"
                  : "border-accent/30 text-accent bg-accent/5",
              )}
            >
              {selectedParty.discount_type} Mode
            </Badge>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Party</Label>
            <Select value={partyId || "none"} onValueChange={(v) => setPartyId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a party (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No party —</SelectItem>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} <span className="text-muted-foreground ml-1">· {p.discount_type}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
              <Tag className="h-3 w-3" /> Segment
            </Label>
            <Select value={segmentId || "none"} onValueChange={(v) => setSegmentId(v === "none" ? "" : v)} disabled={!selectedParty}>
              <SelectTrigger>
                <SelectValue placeholder={selectedParty ? "Select segment" : "Pick a party first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {segments.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedParty && autoApplied && (
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
            <Wand2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>
              Discount applied from Party Settings —{" "}
              <span className="font-semibold text-foreground">
                {autoApplied === "segment" ? "segment override" : autoApplied === "agreed" ? "agreed discount" : "default discount"}
              </span>
              . You can still edit the value manually below.
            </span>
          </div>
        )}

        {cdPartySummary && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <PartySummaryStat label="Default" value={`${cdPartySummary.base}%`} />
            <PartySummaryStat label="CD" value={`+${cdPartySummary.cd}%`} tone="success" />
            <PartySummaryStat label="Commitment" value={`${cdPartySummary.base}% + ${cdPartySummary.cd}%`} />
          </div>
        )}
      </div>

      {/* Main Dynamic Inputs Grid */}
      <div className="grid md:grid-cols-3 gap-4">
        <div
          className={cn(
            "rounded-2xl p-5 bg-card border shadow-soft transition-smooth hover:-translate-y-0.5 bg-gradient-to-br from-primary/20 to-primary/5 relative",
            billEmpty ? "border-primary/50 animate-pulse-border" : "border-border hover:shadow-elegant",
          )}
        >
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Bill Amount</Label>
            {billEmpty && <span className="text-[10px] font-semibold text-primary animate-pulse">ENTER HERE</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-2xl font-display font-semibold text-muted-foreground">₹</span>
            <Input
              type="text"
              inputMode="decimal"
              value={billAmount}
              onChange={(e) => setBillAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              className="border-0 bg-transparent text-2xl font-display font-bold p-0 h-auto focus-visible:ring-0 tabular-nums placeholder:text-muted-foreground/40 placeholder:text-lg"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Enter total bill amount here</p>
        </div>

        <InputCard 
          label="Bill Discount" 
          value={billDiscount} 
          onChange={setBillDiscount} 
          accent="from-accent/20 to-accent/5" 
          suffix="%" 
          helper={selectedParty ? "Auto-filled from Party settings" : undefined} 
        />

        {mode === "CD" ? (
          <InputCard
            label="Cash Discount (CD)"
            value={cdDiscount}
            onChange={setCdDiscount}
            accent="from-success/20 to-success/5"
            suffix="%"
            helper={selectedParty ? "Auto-calculated from segment discount" : undefined}
          />
        ) : (
          <InputCard
            label="Required Discount"
            value={requiredDiscount}
            onChange={setRequiredDiscount}
            accent="from-primary-glow/20 to-primary-glow/5"
            suffix="%"
          />
        )}
      </div>

      {/* Rate Diff Helper Info (Only for RD Mode) */}
      {mode === "RD" && selectedParty && (
        <div className="rounded-2xl p-5 bg-card border border-border shadow-soft bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Rate Difference (Agreed − Bill)</p>
              <p className="font-display text-2xl font-bold mt-1 tabular-nums">
                {calc.agreedDiff >= 0 ? "+" : ""}{calc.agreedDiff.toFixed(2)}%
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              Agreed: <span className="font-semibold text-foreground">{selectedParty.agreed_discount}%</span>
              <span className="mx-2">·</span>
              Bill: <span className="font-semibold text-foreground">{calc.bDisc}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Metadata Accordion Section */}
      <Collapsible open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <div className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-smooth">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-semibold">Invoice Details</h3>
                  <p className="text-xs text-muted-foreground">
                    {hasInvoiceData ? "Added — included in PDF & share" : "Optional — used for PDF & WhatsApp"}
                  </p>
                </div>
              </div>
              <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", invoiceOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="p-5 pt-0 grid md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Party Name</Label>
                <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="e.g. Ram Traders" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Invoice Number</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-001" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Invoice Date</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Breakdowns & Output Analytics Grid */}
      {mode === "CD" ? (
        <div className="grid md:grid-cols-3 gap-4">
          <ResultCard label="Bill Amount (MRP)" value={`₹${fmtINR(calc.bill)}`} subtle />
          <ResultCard label={`Net after ${calc.bDisc}% Base`} value={`₹${fmtINR(calc.cdNetAmount)}`} subtle />
          {calc.cd > 0 && (
            <ResultCard
              label={`CD Amount (${calc.cd}%)`}
              value={`-₹${fmtINR(calc.cdAmount)}`}
              tone="success"
              icon={TrendingDown}
            />
          )}
          <ResultCard label="Final Payable" value={`₹${fmtINR(calc.afterCd)}`} tone="success" />
          <ResultCard label="Effective Discount" value={`${calc.cdEffective.toFixed(2)}%`} subtle />
          <ResultCard label="Commitment" value={`${calc.bDisc}% + ${calc.cd}%`} subtle />
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <ResultCard label="Bill on MRP" value={`₹${fmtINR(calc.billOnMrp)}`} subtle />
          <ResultCard label="After RD" value={`₹${fmtINR(calc.finalPayable)}`} tone="success" />
          <ResultCard
            label="RD Amount"
            value={`${isNegative ? "-" : "+"}₹${fmtINR(Math.abs(calc.rdAmount))}`}
            tone={isNegative ? "destructive" : "warning"}
            icon={isNegative ? TrendingDown : TrendingUp}
          />
        </div>
      )}

      {/* Net Strategic Benefits */}
      {mode && calc.bill > 0 && (
        <div className="rounded-2xl p-5 bg-card border border-border shadow-soft flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Total Benefit</p>
            <p className={cn("font-display text-3xl font-bold mt-1 tabular-nums", calc.totalBenefit >= 0 ? "text-success" : "text-destructive")}>
              {calc.totalBenefit >= 0 ? "+" : "-"}₹{fmtINR(Math.abs(calc.totalBenefit))}
            </p>
          </div>
          <div className="text-xs text-muted-foreground max-w-sm text-right">
            {mode === "CD"
              ? `Sequential: ${calc.bDisc}% Base on MRP, then ${calc.cd}% CD on Net. Effective ${calc.cdEffective.toFixed(2)}%.`
              : calc.totalBenefit >= 0
                ? "Surplus you can adjust against this bill."
                : "Shortfall — additional discount is needed to match."}
          </div>
        </div>
      )}

      {/* AI/Auto Insights Card */}
      <div className="glass rounded-2xl p-6 flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-display font-semibold">Auto Insight</h3>
          {mode === "CD" ? (
            <p className="text-sm text-muted-foreground mt-1">
              Commitment <span className="font-semibold text-foreground">{calc.bDisc}% + {calc.cd}%</span> applied sequentially:
              Net ₹{fmtINR(calc.cdNetAmount)} after base, then{" "}
              <span className="font-semibold text-success">{calc.cd}% CD</span> saves{" "}
              <span className="font-semibold text-success">₹{fmtINR(calc.cdAmount)}</span>.
              Effective discount <span className="font-semibold text-foreground">{calc.cdEffective.toFixed(2)}%</span>.
            </p>
          ) : isNegative ? (
            <p className="text-sm text-muted-foreground mt-1">
              You're short by <span className="font-semibold text-destructive">₹{fmtINR(Math.abs(calc.rdAmount))}</span>.
              You need approximately <span className="font-semibold text-foreground">{calc.extraNeeded.toFixed(2)}%</span> total
              discount to match this bill amount.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Excellent — you have a surplus of <span className="font-semibold text-success">₹{fmtINR(calc.rdAmount)}</span> that can
              be adjusted on this bill.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// SUB-COMPONENTS (PROPERLY TYPED)
// ==========================================
const InputCard = ({
  label, value, onChange, accent, prefix, suffix, helper,
}: InputCardProps) => (
  <div className={cn("rounded-2xl p-5 bg-card border border-border shadow-soft transition-smooth hover:shadow-elegant hover:-translate-y-0.5 bg-gradient-to-br", accent)}>
    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</Label>
    <div className="flex items-center gap-2 mt-2">
      {prefix && <span className="text-2xl font-display font-semibold text-muted-foreground">{prefix}</span>}
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="border-0 bg-transparent text-2xl font-display font-bold p-0 h-auto focus-visible:ring-0 tabular-nums w-full"
      />
      {suffix && <span className="text-2xl font-display font-semibold text-muted-foreground">{suffix}</span>}
    </div>
    {helper && <p className="text-xs text-primary/80 mt-2 font-medium">{helper}</p>}
  </div>
);

const ResultCard = ({
  label, value, tone, subtle, icon: Icon,
}: ResultCardProps) => {
  const toneClass = cn({
    "text-success": tone === "success",
    "text-destructive": tone === "destructive",
    "text-warning": tone === "warning",
    "text-foreground": !tone
  });

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

const PartySummaryStat = ({ label, value, tone }: PartySummaryStatProps) => (
  <div className="rounded-xl border border-border bg-background/60 p-3">
    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
    <p className={cn("mt-1 font-display text-xl font-bold tabular-nums", tone === "success" ? "text-success" : "text-foreground")}>
      {value}
    </p>
  </div>
);

export default Calculator;
