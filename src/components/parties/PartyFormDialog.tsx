// Shared "Add/Edit Party" dialog — extracted verbatim from src/pages/Parties.tsx
// so the full Party Master form (all 7 tabs, every field, identical
// validation and save logic) is the ONE place a party is ever created or
// edited, whether that's from the Parties page itself or "+ New
// Supplier"/"+ New Customer" opened mid-transaction from a voucher or
// document screen (Payment/Receipt/Purchase Order/Sales Order/Journal).
//
// There is deliberately no separate "quick create" field-set — Quick Create
// means "open this same master form without leaving the current
// transaction," not a second, smaller Party form with its own field list.
// A caller wanting a lighter starting point pre-checks Preferred Supplier/
// Preferred Customer via `presetType`; every other field is exactly what
// Parties.tsx already collects.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, Building2, MapPin, BookOpen, Tag, Globe, FileText, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensurePartyLedgers } from "@/lib/accounting";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PartyActivityTimeline from "@/components/parties/PartyActivityTimeline";
import PartyPriceListSummary from "@/components/parties/PartyPriceListSummary";
import type { Party, DiscountType } from "@/lib/parties";

type TabKey = "general" | "address" | "accounting" | "pricing" | "commerce" | "documents" | "history";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "general", label: "General", icon: Building2 },
  { key: "address", label: "Address", icon: MapPin },
  { key: "accounting", label: "Accounting", icon: BookOpen },
  { key: "pricing", label: "Pricing", icon: Tag },
  { key: "commerce", label: "Online Commerce", icon: Globe },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "history", label: "History", icon: History },
];

const emptyForm = {
  name: "", firm_name: "", contact_person: "", phone: "", alt_phone: "",
  email: "", website: "", business_type: "Retailer", industry_segment: "Automobile Parts",
  gst: "", pan: "", msme: "", status: "active",
  billing_address: "", shipping_address: "",
  state: "", district: "", city: "", pincode: "", country: "India", maps_link: "",
  ledger_name: "", opening_balance: "0", balance_type: "CR",
  credit_enabled: false, credit_limit: "0", credit_days: "30",
  interest_pct: "0", last_payment_date: "", last_invoice_date: "",
  outstanding_balance: "0",
  default_discount: "0", discount_type: "RD" as DiscountType, agreed_discount: "0",
  rate_category: "Retail Price", special_discount: "0", pricing_notes: "",
  dealer_network: false, online_ordering: false, allow_credit_orders: false,
  auto_approve: false, network_visibility: false,
  preferred_supplier: false, preferred_customer: false,
  address: "", beat: "", notes: "",
  party_group_id: "" as string, use_group_defaults: true,
  salesman_id: "" as string,
};

const Toggle = ({ value, onChange, label, disabled = false }: {
  value: boolean; onChange: (v: boolean) => void;
  label: string; disabled?: boolean;
}) => (
  <div className={`flex items-center justify-between py-2 ${disabled ? "opacity-40" : ""}`}>
    <span className="text-sm">{label}</span>
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
        ${value ? "bg-primary" : "bg-muted-foreground/30"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
        ${value ? "translate-x-4" : "translate-x-1"}`} />
    </button>
  </div>
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  userId: string;
  /** When set, edits this party instead of creating a new one — identical
   *  contract to QuickCreateLedgerDialog's `ledger` prop. */
  editing?: Party | null;
  /** Called after a successful create/edit with the party's id + name, so a
   *  caller mid-transaction (Payment/Receipt/Purchase Order/Sales Order/
   *  Journal) can immediately select it into whichever field triggered
   *  Quick Create. Parties.tsx itself uses this only to refresh its list. */
  onSaved: (party: { id: string; name: string }) => void;
  /** Pre-checks Preferred Supplier/Preferred Customer for a brand-new party
   *  (ignored when editing) — the only concession a transaction screen gets
   *  over the full Parties.tsx experience; every field below is identical. */
  presetType?: "customer" | "supplier";
}

export default function PartyFormDialog({ open, onOpenChange, businessId, userId, editing, onSaved, presetType }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  type PartyGroupLite = {
    id: string; parent_id: string | null; name: string;
    default_rd_pct: number | null; default_cd_pct: number | null;
    default_credit_days: number | null; default_credit_limit: number | null;
  };
  const [groups, setGroups] = useState<PartyGroupLite[]>([]);
  type SalesmanLite = { id: string; name: string };
  const [salesmenOptions, setSalesmenOptions] = useState<SalesmanLite[]>([]);

  useEffect(() => {
    if (!open || !businessId) return;
    supabase
      .from("party_groups")
      .select("id, parent_id, name, default_rd_pct, default_cd_pct, default_credit_days, default_credit_limit")
      .eq("business_id", businessId)
      .order("name")
      .then(({ data }) => setGroups((data as PartyGroupLite[]) ?? []));
    supabase
      .from("salesmen" as never)
      .select("id, name")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setSalesmenOptions((data as unknown as SalesmanLite[]) ?? []));
  }, [open, businessId]);

  const resolveGroupDefaults = useCallback((groupId: string | null) => {
    if (!groupId) return null;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return null;
    const parent = group.parent_id ? groups.find((g) => g.id === group.parent_id) : undefined;
    return {
      rd: group.default_rd_pct ?? parent?.default_rd_pct ?? 0,
      cd: group.default_cd_pct ?? parent?.default_cd_pct ?? 0,
      creditDays: group.default_credit_days ?? parent?.default_credit_days ?? null,
      creditLimit: group.default_credit_limit ?? parent?.default_credit_limit ?? null,
    };
  }, [groups]);

  const applyGroupToForm = (groupId: string, useDefaults: boolean) => {
    if (!useDefaults) return;
    const resolved = resolveGroupDefaults(groupId);
    if (!resolved) return;
    setForm((f) => ({
      ...f,
      party_group_id: groupId,
      use_group_defaults: true,
      agreed_discount: String(f.discount_type === "CD" ? resolved.cd : resolved.rd),
      credit_limit: resolved.creditLimit != null ? String(resolved.creditLimit) : f.credit_limit,
    }));
  };

  useEffect(() => {
    if (!open) return;
    setActiveTab("general");
    if (editing) {
      setForm({
        ...emptyForm,
        name: editing.name,
        phone: editing.phone || "",
        gst: editing.gst || "",
        address: editing.address || "",
        billing_address: editing.billing_address || "",
        shipping_address: editing.shipping_address || "",
        beat: editing.beat || "",
        credit_limit: String(editing.credit_limit ?? 0),
        outstanding_balance: String(editing.outstanding_balance ?? 0),
        agreed_discount: String(editing.agreed_discount ?? 0),
        default_discount: String(editing.default_discount ?? 0),
        discount_type: (editing.discount_type as DiscountType) || "RD",
        notes: editing.notes || "",
        party_group_id: editing.party_group_id || "",
        use_group_defaults: editing.use_group_defaults ?? true,
        salesman_id: editing.salesman_id || "",
        preferred_supplier: editing.preferred_supplier ?? false,
        preferred_customer: editing.preferred_customer ?? false,
        firm_name: editing.firm_name || "",
        contact_person: editing.contact_person || "",
        alt_phone: editing.alt_phone || "",
        email: editing.email || "",
        website: editing.website || "",
        business_type: editing.business_type || "Retailer",
        industry_segment: editing.industry_segment || "Automobile Parts",
        pan: editing.pan || "",
        msme: editing.msme || "",
        status: editing.status || "active",
        state: editing.state || "",
        district: editing.district || "",
        city: editing.city || "",
        pincode: editing.pincode || "",
        country: editing.country || "India",
        maps_link: editing.maps_link || "",
        ledger_name: editing.ledger_name || editing.name,
        opening_balance: String(editing.opening_balance ?? 0),
        balance_type: editing.balance_type || "CR",
        credit_enabled: editing.credit_enabled ?? false,
        credit_days: String(editing.credit_days ?? 30),
        interest_pct: String(editing.interest_pct ?? 0),
        last_payment_date: editing.last_payment_date || "",
        last_invoice_date: editing.last_invoice_date || "",
        rate_category: editing.rate_category || "Retail Price",
        special_discount: String(editing.special_discount ?? 0),
        pricing_notes: editing.pricing_notes || "",
        dealer_network: editing.dealer_network ?? false,
        online_ordering: editing.online_ordering ?? false,
        allow_credit_orders: editing.allow_credit_orders ?? false,
        auto_approve: editing.auto_approve ?? false,
        network_visibility: editing.network_visibility ?? false,
      });
    } else {
      setForm({
        ...emptyForm,
        preferred_supplier: presetType === "supplier",
        preferred_customer: presetType === "customer",
      });
    }
  }, [open, editing, presetType]);

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("Party name is required");
    setSaving(true);
    try {
      // outstanding_balance is trigger-maintained from the party's linked
      // ledger (apply_ledger_balance_delta(), fired on every posted
      // voucher) the moment one exists -- re-sending whatever this dialog
      // loaded at open time on every EDIT save would clobber a fresher
      // trigger write with a stale snapshot (exactly what produced a party
      // showing ₹10,300 outstanding while its real ledger sat at ₹0).
      // opening_balance carries the same risk despite being read-only in
      // this form (nothing mutates it after load, but it can still go
      // stale between open and save, e.g. via the Opening Balance
      // Migration wizard). Both are safe to include on CREATE (a brand
      // new party has no ledger yet, so 0 is simply correct), but must be
      // omitted from an UPDATE payload so editing any other field never
      // re-persists a stale ledger-adjacent number.
      const payload: Record<string, unknown> = {
        user_id: userId,
        business_id: businessId,
        name: form.name.trim(),
        address: form.address.trim() || null,
        default_discount: parseFloat(form.default_discount) || 0,
        discount_type: form.discount_type,
        agreed_discount: parseFloat(form.agreed_discount) || 0,
        phone: form.phone.trim() || null,
        gst: form.gst.trim() || null,
        billing_address: form.billing_address.trim() || null,
        shipping_address: form.shipping_address.trim() || null,
        beat: form.beat.trim() || null,
        credit_limit: parseFloat(form.credit_limit) || 0,
        notes: form.notes.trim() || null,
        party_group_id: form.party_group_id || null,
        use_group_defaults: form.use_group_defaults,
        salesman_id: form.salesman_id || null,
        preferred_customer: form.preferred_customer,
        preferred_supplier: form.preferred_supplier,
        firm_name: form.firm_name.trim() || null,
        contact_person: form.contact_person.trim() || null,
        alt_phone: form.alt_phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        business_type: form.business_type,
        industry_segment: form.industry_segment,
        pan: form.pan.trim() || null,
        msme: form.msme.trim() || null,
        status: form.status,
        state: form.state.trim() || null,
        district: form.district.trim() || null,
        city: form.city.trim() || null,
        pincode: form.pincode.trim() || null,
        country: form.country.trim() || null,
        maps_link: form.maps_link.trim() || null,
        ledger_name: form.ledger_name.trim() || null,
        balance_type: form.balance_type,
        credit_enabled: form.credit_enabled,
        credit_days: parseInt(form.credit_days, 10) || 0,
        interest_pct: parseFloat(form.interest_pct) || 0,
        last_payment_date: form.last_payment_date || null,
        last_invoice_date: form.last_invoice_date || null,
        rate_category: form.rate_category,
        special_discount: parseFloat(form.special_discount) || 0,
        pricing_notes: form.pricing_notes.trim() || null,
        dealer_network: form.dealer_network,
        online_ordering: form.online_ordering,
        allow_credit_orders: form.allow_credit_orders,
        auto_approve: form.auto_approve,
        network_visibility: form.network_visibility,
        created_by: userId,
      };
      let savedId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("parties").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        // Only a brand-new party gets these two written -- it has no
        // linked ledger yet, so 0 is simply correct (see the comment
        // above `payload`).
        const { data, error } = await supabase.from("parties").insert({
          ...payload,
          outstanding_balance: parseFloat(form.outstanding_balance) || 0,
          opening_balance: parseFloat(form.opening_balance) || 0,
        }).select("id").single();
        if (error) throw error;
        savedId = (data as any).id;
      }
      if (form.preferred_customer || form.preferred_supplier) {
        await ensurePartyLedgers(userId);
      }
      toast.success(editing ? "Party updated" : "Party added");
      onOpenChange(false);
      onSaved({ id: savedId!, name: form.name.trim() });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0" onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
          <DialogTitle className="font-display text-xl">
            {editing ? `Edit Party — ${editing.name}` : "Add New Party"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex overflow-x-auto border-b border-border px-6 shrink-0 gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors
                ${activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">

          {activeTab === "general" && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label>Party Group</Label>
                    <Select
                      value={form.party_group_id || "none"}
                      onValueChange={(v) => {
                        const gid = v === "none" ? "" : v;
                        setForm((f) => ({ ...f, party_group_id: gid }));
                        if (gid) applyGroupToForm(gid, form.use_group_defaults);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="No group" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No group</SelectItem>
                        {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="use-group-defaults"
                      checked={form.use_group_defaults}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm((f) => ({ ...f, use_group_defaults: checked }));
                        if (checked && form.party_group_id) applyGroupToForm(form.party_group_id, true);
                      }}
                    />
                    <Label htmlFor="use-group-defaults" className="font-normal cursor-pointer">Use Group Defaults</Label>
                  </div>
                </div>
                {form.party_group_id && (() => {
                  const r = resolveGroupDefaults(form.party_group_id);
                  if (!r) return null;
                  const tag = form.use_group_defaults ? "Group" : "Override";
                  return (
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                      <span>RD <b className="text-foreground">{r.rd}%</b> ({tag})</span>
                      <span>CD <b className="text-foreground">{r.cd}%</b> ({tag})</span>
                      {r.creditDays != null && <span>Credit <b className="text-foreground">{r.creditDays}d</b> ({tag})</span>}
                      {r.creditLimit != null && <span>Limit <b className="text-foreground">₹{r.creditLimit.toLocaleString("en-IN")}</b> ({tag})</span>}
                    </div>
                  );
                })()}
              </div>
              <div className="space-y-1.5">
                <Label>Party Name *</Label>
                <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ram Traders" />
              </div>
              <div className="space-y-1.5">
                <Label>Salesman</Label>
                <Select
                  value={form.salesman_id || "none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, salesman_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {salesmenOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Firm Name</Label>
                <Input value={form.firm_name} onChange={(e) => setForm({ ...form, firm_name: e.target.value })} placeholder="Legal entity name" />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="Owner / Manager name" />
              </div>
              <div className="space-y-1.5">
                <Label>Mobile Number</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-1.5">
                <Label>Alternate Mobile</Label>
                <Input value={form.alt_phone} onChange={(e) => setForm({ ...form, alt_phone: e.target.value })} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="party@email.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-1.5">
                <Label>Business Type</Label>
                <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Retailer", "Wholesaler", "Distributor", "Dealer", "Workshop", "Manufacturer", "Supplier", "Customer", "Customer + Supplier"]
                      .map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Industry Segment</Label>
                <Select value={form.industry_segment} onValueChange={(v) => setForm({ ...form, industry_segment: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Automobile Parts", "Tyres", "Lubricants", "Electrical", "Hardware", "FMCG", "Others"]
                      .map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>GST Number</Label>
                <Input value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} placeholder="29ABCDE1234F1Z5" />
              </div>
              <div className="space-y-1.5">
                <Label>PAN Number</Label>
                <Input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} placeholder="ABCDE1234F" />
              </div>
              <div className="space-y-1.5">
                <Label>MSME Number</Label>
                <Input value={form.msme} onChange={(e) => setForm({ ...form, msme: e.target.value })} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Beat / Area</Label>
                <Input value={form.beat} onChange={(e) => setForm({ ...form, beat: e.target.value })} placeholder="e.g. Market Road" />
              </div>
            </div>
          )}

          {activeTab === "address" && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Billing Address</Label>
                <Textarea value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} rows={3} placeholder="Full billing address" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Shipping Address</Label>
                <Textarea value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} rows={3} placeholder="Leave blank if same as billing" />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="e.g. Karnataka" />
              </div>
              <div className="space-y-1.5">
                <Label>District</Label>
                <Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="e.g. Bengaluru Urban" />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="e.g. Bengaluru" />
              </div>
              <div className="space-y-1.5">
                <Label>Pincode</Label>
                <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} placeholder="560001" />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Google Maps Link</Label>
                <Input value={form.maps_link} onChange={(e) => setForm({ ...form, maps_link: e.target.value })} placeholder="https://maps.google.com/..." />
              </div>
            </div>
          )}

          {activeTab === "accounting" && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Ledger Name</Label>
                  <Input value={form.ledger_name} onChange={(e) => setForm({ ...form, ledger_name: e.target.value })} placeholder="Auto-filled from party name" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="flex items-center justify-between">
                    <span>Opening Balance (₹)</span>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => navigate("/settings/opening-balance-migration")}
                    >
                      Set via Opening Balance Migration →
                    </Button>
                  </Label>
                  <div className="flex gap-2">
                    <Input type="number" value={form.opening_balance} readOnly disabled className="bg-muted" />
                    <Select value={form.balance_type} disabled>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DR">DR (Debit)</SelectItem>
                        <SelectItem value="CR">CR (Credit)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This value is a legacy/informational field only and does not affect the party's ledger balance.
                    Use the Opening Balance Migration wizard to post an opening balance that reflects in the ledger, trial balance, and balance sheet.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Credit Days</Label>
                  <Input type="number" value={form.credit_days} onChange={(e) => setForm({ ...form, credit_days: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Credit Limit (₹)</Label>
                    {form.party_group_id && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${form.use_group_defaults ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                        {form.use_group_defaults ? "Inherited" : "Overridden"}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    value={form.credit_limit}
                    disabled={form.use_group_defaults && !!form.party_group_id}
                    onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Interest % (p.a.)</Label>
                  <Input type="number" value={form.interest_pct} onChange={(e) => setForm({ ...form, interest_pct: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Last Payment Date</Label>
                  <Input type="date" value={form.last_payment_date} onChange={(e) => setForm({ ...form, last_payment_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Last Invoice Date</Label>
                  <Input type="date" value={form.last_invoice_date} onChange={(e) => setForm({ ...form, last_invoice_date: e.target.value })} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding Amount</p>
                  <p className="font-display text-xl font-bold mt-1 tabular-nums">
                    ₹{Number(form.outstanding_balance).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Available Credit</p>
                  <p className={`font-display text-xl font-bold mt-1 tabular-nums
                    ${(Number(form.credit_limit) - Number(form.outstanding_balance)) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                    ₹{(Number(form.credit_limit) - Number(form.outstanding_balance)).toLocaleString()}
                  </p>
                </div>
              </div>

              {Number(form.outstanding_balance) > Number(form.credit_limit) && Number(form.credit_limit) > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Outstanding exceeds credit limit. Orders may be blocked.
                </div>
              )}

              <div className="flex items-center gap-2">
                <Toggle value={form.credit_enabled} onChange={(v) => setForm({ ...form, credit_enabled: v })} label="Credit Enabled" />
              </div>
            </div>
          )}

          {activeTab === "pricing" && (
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default Discount (%)</Label>
                <Input type="number" value={form.default_discount} onChange={(e) => setForm({ ...form, default_discount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Agreed Discount (%)</Label>
                  {form.party_group_id && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${form.use_group_defaults ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-700"}`}>
                      {form.use_group_defaults ? "Inherited" : "Overridden"}
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  value={form.agreed_discount}
                  disabled={form.use_group_defaults && !!form.party_group_id}
                  onChange={(e) => setForm({ ...form, agreed_discount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>RD / CD Mode</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v as DiscountType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RD">RD (Regular Discount)</SelectItem>
                    <SelectItem value="CD">CD (Cash Discount)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rate Category</Label>
                <Select value={form.rate_category} onValueChange={(v) => setForm({ ...form, rate_category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Retail Price">Retail Price</SelectItem>
                    <SelectItem value="Dealer Price">Dealer Price</SelectItem>
                    <SelectItem value="Distributor Price">Distributor Price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Special Discount (%)</Label>
                <Input type="number" value={form.special_discount} onChange={(e) => setForm({ ...form, special_discount: e.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Pricing Notes</Label>
                <Textarea value={form.pricing_notes} onChange={(e) => setForm({ ...form, pricing_notes: e.target.value })} rows={2} placeholder="Special pricing terms..." />
              </div>
              <PartyPriceListSummary partyId={editing?.id} />
            </div>
          )}

          {activeTab === "commerce" && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-3">Manage dealer network and online ordering settings for this party.</p>
              <div className="rounded-xl border border-border divide-y divide-border px-4">
                <Toggle value={form.dealer_network} onChange={(v) => setForm({ ...form, dealer_network: v })} label="Dealer Network Member" />
                <Toggle value={form.online_ordering} onChange={(v) => setForm({ ...form, online_ordering: v })} label="Online Ordering Access" />
                <Toggle value={form.allow_credit_orders} onChange={(v) => setForm({ ...form, allow_credit_orders: v })} label="Allow Credit Orders" />
                <Toggle value={form.auto_approve} onChange={(v) => setForm({ ...form, auto_approve: v })} label="Auto Approve Orders" />
                <Toggle value={form.network_visibility} onChange={(v) => setForm({ ...form, network_visibility: v })} label="Network Visibility" />
                <Toggle value={form.preferred_supplier} onChange={(v) => setForm({ ...form, preferred_supplier: v })} label="Preferred Supplier" />
                <Toggle value={form.preferred_customer} onChange={(v) => setForm({ ...form, preferred_customer: v })} label="Preferred Customer" />
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-border px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Future Features</p>
                <Toggle value={false} onChange={() => {}} label="Auto Purchase Sync" disabled />
                <Toggle value={false} onChange={() => {}} label="Auto Sales Sync" disabled />
                <Toggle value={false} onChange={() => {}} label="Marketplace Participation" disabled />
              </div>
            </div>
          )}

          {activeTab === "documents" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Upload KYC and compliance documents for this party.</p>
              {["GST Certificate", "PAN Card", "Trade License", "Cancelled Cheque", "Other Documents"].map((doc) => (
                <div key={doc} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{doc}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">No file uploaded</p>
                  </div>
                  <Button variant="outline" size="sm" disabled className="text-xs opacity-50">
                    Upload
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-center pt-2">Document upload will be available in a future release.</p>
            </div>
          )}

          {activeTab === "history" && (
            <PartyActivityTimeline partyId={editing?.id} />
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gradient-primary text-white border-0 hover:opacity-90">
            {saving ? "Saving…" : editing ? "Update Party" : "Create Party"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
