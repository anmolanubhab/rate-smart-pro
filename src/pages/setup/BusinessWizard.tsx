import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { logAudit } from "@/lib/audit";

const STEPS = ["Identity", "Tax & Legal", "Address", "Contact", "Finance"] as const;

type Form = {
  business_name: string;
  firm_name: string;
  business_type: string;
  industry_segment: string;
  gst_number: string;
  pan_number: string;
  tan_number: string;
  msme_number: string;
  address: string;
  state: string;
  district: string;
  city: string;
  pincode: string;
  owner_name: string;
  mobile: string;
  email: string;
  website: string;
  fy_start_month: number;
  gst_enabled: boolean;
  composition_scheme: boolean;
  default_gst_pct: number;
  logo_url: string;
};

const empty: Form = {
  business_name: "", firm_name: "", business_type: "Proprietorship", industry_segment: "Automotive Spare Parts",
  gst_number: "", pan_number: "", tan_number: "", msme_number: "",
  address: "", state: "", district: "", city: "", pincode: "",
  owner_name: "", mobile: "", email: "", website: "",
  fy_start_month: 4, gst_enabled: true, composition_scheme: false, default_gst_pct: 18,
  logo_url: "",
};

export default function BusinessWizard() {
  const { user } = useAuth();
  const { business, refetch } = useBusiness();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(empty);

  useEffect(() => { document.title = "Business Setup — RD Pro"; }, []);
  useEffect(() => {
    if (business) setForm((f) => ({ ...f, ...(business as never) }));
  }, [business]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async (complete: boolean) => {
    if (!user) return;
    if (!form.business_name.trim()) {
      toast.error("Business name is required");
      setStep(0);
      return;
    }
    setSaving(true);
    try {
      if (business) {
        const { error } = await supabase.from("businesses")
          .update({ ...form, setup_completed: complete || business.setup_completed })
          .eq("id", business.id);
        if (error) throw error;
        await logAudit({ business_id: business.id, action: "BUSINESS_UPDATE", entity_type: "business", entity_id: business.id, new_value: form });
      } else {
        const { data: created, error } = await supabase.from("businesses")
          .insert({ ...form, owner_id: user.id, setup_completed: complete })
          .select("id").single();
        if (error) throw error;
        const { error: mErr } = await supabase.from("business_members").insert({
          business_id: created.id, user_id: user.id, role: "owner", status: "active",
        });
        if (mErr) throw mErr;
        await logAudit({ business_id: created.id, action: "BUSINESS_CREATE", entity_type: "business", entity_id: created.id, new_value: form });
      }
      await qc.invalidateQueries({ queryKey: ["current-business"] });
      await refetch();
      toast.success(complete ? "Setup completed" : "Progress saved");
      if (complete) nav("/dashboard");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <p className="text-sm text-muted-foreground">Welcome</p>
          <h1 className="font-display text-3xl font-bold mt-1">Set up your business</h1>
          <p className="text-sm text-muted-foreground mt-2">
            We need a few details before you can use RD Pro. You can update these later from Settings.
          </p>
        </header>

        <div className="flex gap-2 flex-wrap">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i)}
              className={`px-3 py-1.5 rounded-full text-xs border ${
                i === step ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
              }`}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-card border p-6 space-y-4">
          {step === 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Business Name *"><Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} /></Field>
              <Field label="Firm Name"><Input value={form.firm_name} onChange={(e) => set("firm_name", e.target.value)} /></Field>
              <Field label="Business Type">
                <Select value={form.business_type} onValueChange={(v) => set("business_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Proprietorship","Partnership","LLP","Private Limited","Public Limited","HUF","Other"].map(t =>
                      <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Industry Segment"><Input value={form.industry_segment} onChange={(e) => set("industry_segment", e.target.value)} /></Field>
              <Field label="Logo URL"><Input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://..." /></Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="GST Number"><Input value={form.gst_number} onChange={(e) => set("gst_number", e.target.value.toUpperCase())} /></Field>
              <Field label="PAN Number"><Input value={form.pan_number} onChange={(e) => set("pan_number", e.target.value.toUpperCase())} /></Field>
              <Field label="TAN Number"><Input value={form.tan_number} onChange={(e) => set("tan_number", e.target.value.toUpperCase())} /></Field>
              <Field label="MSME / Udyam Number"><Input value={form.msme_number} onChange={(e) => set("msme_number", e.target.value)} /></Field>
              <Field label="Default GST %"><Input type="number" value={form.default_gst_pct} onChange={(e) => set("default_gst_pct", Number(e.target.value))} /></Field>
              <div className="space-y-3 pt-7">
                <Toggle label="GST Enabled" value={form.gst_enabled} onChange={(v) => set("gst_enabled", v)} />
                <Toggle label="Composition Scheme" value={form.composition_scheme} onChange={(v) => set("composition_scheme", v)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Address" className="md:col-span-2"><Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field label="State"><Input value={form.state} onChange={(e) => set("state", e.target.value)} /></Field>
              <Field label="District"><Input value={form.district} onChange={(e) => set("district", e.target.value)} /></Field>
              <Field label="City"><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="Pincode"><Input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Owner Name"><Input value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} /></Field>
              <Field label="Mobile"><Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} /></Field>
              <Field label="Email"><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="Website"><Input value={form.website} onChange={(e) => set("website", e.target.value)} /></Field>
            </div>
          )}

          {step === 4 && (
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Financial Year Start Month">
                <Select value={String(form.fy_start_month)} onValueChange={(v) => set("fy_start_month", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["January","February","March","April","May","June","July","August","September","October","November","December"]
                      .map((m, i) => <SelectItem key={m} value={String(i+1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-3">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>Save draft</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <Button onClick={() => save(true)} disabled={saving}>Finish setup</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1.5 ${className}`}>
    <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
    <span className="text-sm">{label}</span>
    <Switch checked={value} onCheckedChange={onChange} />
  </div>
);
