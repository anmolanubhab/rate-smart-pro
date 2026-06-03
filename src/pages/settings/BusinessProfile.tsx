import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness, can } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logAudit } from "@/lib/audit";

export default function BusinessProfile() {
  const { business, role, loading, refetch } = useBusiness();
  const nav = useNavigate();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { document.title = "Business Profile — RD Pro"; }, []);
  useEffect(() => { if (business) setForm({ ...business }); }, [business]);

  const editable = can(role, "business.edit");
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!business) return (
    <div className="space-y-4">
      <p>No business found. Complete setup first.</p>
      <Button onClick={() => nav("/setup/business")}>Open setup</Button>
    </div>
  );

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("businesses").update(form as never).eq("id", business.id);
      if (error) throw error;
      await logAudit({ business_id: business.id, action: "BUSINESS_UPDATE", entity_type: "business", entity_id: business.id, new_value: form });
      toast.success("Profile updated");
      await refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  const f = form as Record<string, string | number | boolean | null>;

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Business Profile</h1>
        {!editable && <p className="text-xs text-muted-foreground mt-2">Read-only · your role ({role}) can't edit business details.</p>}
      </header>

      <Section title="Identity">
        <Row label="Business Name"><Input disabled={!editable} value={(f.business_name as string) || ""} onChange={(e) => set("business_name", e.target.value)} /></Row>
        <Row label="Firm Name"><Input disabled={!editable} value={(f.firm_name as string) || ""} onChange={(e) => set("firm_name", e.target.value)} /></Row>
        <Row label="Business Type"><Input disabled={!editable} value={(f.business_type as string) || ""} onChange={(e) => set("business_type", e.target.value)} /></Row>
        <Row label="Industry"><Input disabled={!editable} value={(f.industry_segment as string) || ""} onChange={(e) => set("industry_segment", e.target.value)} /></Row>
        <Row label="Logo URL"><Input disabled={!editable} value={(f.logo_url as string) || ""} onChange={(e) => set("logo_url", e.target.value)} /></Row>
      </Section>

      <Section title="Tax & Legal">
        <Row label="GST"><Input disabled={!editable} value={(f.gst_number as string) || ""} onChange={(e) => set("gst_number", e.target.value.toUpperCase())} /></Row>
        <Row label="PAN"><Input disabled={!editable} value={(f.pan_number as string) || ""} onChange={(e) => set("pan_number", e.target.value.toUpperCase())} /></Row>
        <Row label="TAN"><Input disabled={!editable} value={(f.tan_number as string) || ""} onChange={(e) => set("tan_number", e.target.value.toUpperCase())} /></Row>
        <Row label="MSME / Udyam"><Input disabled={!editable} value={(f.msme_number as string) || ""} onChange={(e) => set("msme_number", e.target.value)} /></Row>
      </Section>

      <Section title="Address">
        <Row label="Address" full><Textarea rows={2} disabled={!editable} value={(f.address as string) || ""} onChange={(e) => set("address", e.target.value)} /></Row>
        <Row label="State"><Input disabled={!editable} value={(f.state as string) || ""} onChange={(e) => set("state", e.target.value)} /></Row>
        <Row label="District"><Input disabled={!editable} value={(f.district as string) || ""} onChange={(e) => set("district", e.target.value)} /></Row>
        <Row label="City"><Input disabled={!editable} value={(f.city as string) || ""} onChange={(e) => set("city", e.target.value)} /></Row>
        <Row label="Pincode"><Input disabled={!editable} value={(f.pincode as string) || ""} onChange={(e) => set("pincode", e.target.value)} /></Row>
      </Section>

      <Section title="Contact">
        <Row label="Owner Name"><Input disabled={!editable} value={(f.owner_name as string) || ""} onChange={(e) => set("owner_name", e.target.value)} /></Row>
        <Row label="Mobile"><Input disabled={!editable} value={(f.mobile as string) || ""} onChange={(e) => set("mobile", e.target.value)} /></Row>
        <Row label="Email"><Input disabled={!editable} value={(f.email as string) || ""} onChange={(e) => set("email", e.target.value)} /></Row>
        <Row label="Website"><Input disabled={!editable} value={(f.website as string) || ""} onChange={(e) => set("website", e.target.value)} /></Row>
      </Section>

      <Section title="Bank">
        <Row label="Bank Name"><Input disabled={!editable} value={(f.bank_name as string) || ""} onChange={(e) => set("bank_name", e.target.value)} /></Row>
        <Row label="Account Number"><Input disabled={!editable} value={(f.bank_account_number as string) || ""} onChange={(e) => set("bank_account_number", e.target.value)} /></Row>
        <Row label="IFSC"><Input disabled={!editable} value={(f.bank_ifsc as string) || ""} onChange={(e) => set("bank_ifsc", e.target.value.toUpperCase())} /></Row>
        <Row label="Branch"><Input disabled={!editable} value={(f.bank_branch as string) || ""} onChange={(e) => set("bank_branch", e.target.value)} /></Row>
      </Section>

      <Section title="Invoice">
        <Row label="Invoice Prefix"><Input disabled={!editable} value={(f.invoice_prefix as string) || ""} onChange={(e) => set("invoice_prefix", e.target.value)} /></Row>
        <Row label="Terms & Conditions" full><Textarea rows={3} disabled={!editable} value={(f.invoice_terms as string) || ""} onChange={(e) => set("invoice_terms", e.target.value)} /></Row>
      </Section>

      {editable && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      )}
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-card border p-6">
    <h2 className="font-display text-lg font-semibold mb-4">{title}</h2>
    <div className="grid md:grid-cols-2 gap-4">{children}</div>
  </section>
);
const Row = ({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) => (
  <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
    <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
    {children}
  </div>
);
