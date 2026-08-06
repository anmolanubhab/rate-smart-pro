import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PlusCircle, Trash2, Star } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  fetchPrintProfiles, createPrintProfile, updatePrintProfile, deletePrintProfile, setDefaultPrintProfile,
  type PrintProfile, type PrintDocumentType, type PrintPageSize, type PrintOrientation, type PrintLogoPosition,
} from "@/lib/printProfiles";
import type { PrintLanguage } from "@/components/print/printLabels";
import { usePrintPreference, useSetPrintPreference, DEFAULT_PRINT_ACTION_OPTIONS, type DefaultPrintAction } from "@/lib/printPreferences";
import { useShareLinkExpiry, setShareLinkExpiry, SHARE_LINK_EXPIRY_OPTIONS, type ShareLinkExpiry } from "@/lib/shareLinkExpiry";
import type { TemplateId } from "@/lib/documentUdm/types";

const TEMPLATE_OPTIONS: { value: TemplateId; label: string; comingSoon?: boolean }[] = [
  { value: "classic", label: "Classic" },
  { value: "thermal", label: "Thermal (receipt)" },
  { value: "modern", label: "Modern", comingSoon: true },
  { value: "gst_standard", label: "GST Standard", comingSoon: true },
  { value: "custom", label: "Custom", comingSoon: true },
];

const LANGUAGES: { value: PrintLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi (हिंदी)" },
];

const DOCUMENT_TYPES: { value: PrintDocumentType; label: string }[] = [
  { value: "sales_invoice", label: "Sales Invoice" },
  { value: "purchase_invoice", label: "Purchase Invoice" },
  { value: "delivery_challan", label: "Delivery Challan" },
  { value: "sales_order", label: "Sales Order" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "grn", label: "Goods Receipt Note (GRN)" },
  { value: "quotation", label: "Quotation" },
  { value: "sales_return", label: "Sales Return / Credit Note" },
  { value: "purchase_return", label: "Purchase Return / Debit Note" },
  { value: "packing_slip", label: "Packing Slip" },
  { value: "debit_note", label: "Debit Note" },
  { value: "credit_note", label: "Credit Note" },
  { value: "payment_receipt", label: "Payment / Receipt Voucher" },
  { value: "journal_voucher", label: "Journal Voucher" },
  { value: "contra_voucher", label: "Contra Voucher" },
];

const LEDGER_DOCUMENT_TYPES: PrintDocumentType[] = ["debit_note", "credit_note", "payment_receipt", "journal_voucher", "contra_voucher"];

const PAGE_SIZES: PrintPageSize[] = ["A4", "A5", "Letter", "Thermal_80mm", "Thermal_58mm"];

type FormState = {
  name: string;
  template_id: TemplateId;
  page_size: PrintPageSize;
  orientation: PrintOrientation;
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  show_header: boolean;
  show_footer: boolean;
  logo_position: PrintLogoPosition;
  show_signature: boolean;
  document_label: string;
  party_label: string;
  show_hsn: boolean;
  show_rate: boolean;
  show_gst_summary: boolean;
  show_amount: boolean;
  show_discount: boolean;
  show_transport_section: boolean;
  show_mrp: boolean;
  show_discount_column: boolean;
  show_warehouse: boolean;
  show_weight: boolean;
  language: PrintLanguage;
  show_qr_code: boolean;
  purpose_text: string;
  show_watermark: boolean;
  watermark_text: string;
  show_bank_details: boolean;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  bank_branch: string;
  terms: string;
};

const DOCUMENT_LABELS: Record<PrintDocumentType, string> = {
  sales_invoice: "TAX INVOICE",
  purchase_invoice: "PURCHASE INVOICE",
  delivery_challan: "DELIVERY CHALLAN",
  sales_order: "SALES ORDER",
  purchase_order: "PURCHASE ORDER",
  quotation: "QUOTATION",
  sales_return: "CREDIT NOTE / SALES RETURN",
  purchase_return: "DEBIT NOTE / PURCHASE RETURN",
  grn: "GOODS RECEIPT NOTE",
  packing_slip: "PACKING SLIP",
  debit_note: "DEBIT NOTE",
  credit_note: "CREDIT NOTE",
  payment_receipt: "PAYMENT VOUCHER",
  journal_voucher: "JOURNAL VOUCHER",
  contra_voucher: "CONTRA VOUCHER",
};

const PARTY_LABELS: Record<PrintDocumentType, string> = {
  sales_invoice: "BILL TO", purchase_invoice: "BILL TO", delivery_challan: "DELIVER TO",
  sales_order: "BILL TO", purchase_order: "SUPPLIER", quotation: "TO", sales_return: "BILL TO", purchase_return: "SUPPLIER", grn: "SUPPLIER", packing_slip: "DELIVER TO",
  debit_note: "", credit_note: "", payment_receipt: "", journal_voucher: "", contra_voucher: "",
};

function blankForm(documentType: PrintDocumentType): FormState {
  const isChallanLike = documentType === "delivery_challan" || documentType === "packing_slip";
  const isLedger = LEDGER_DOCUMENT_TYPES.includes(documentType);
  const isProductDoc = !isChallanLike && !isLedger;
  return {
    name: "",
    template_id: "classic",
    page_size: "A4",
    orientation: "portrait",
    margin_top_mm: 10,
    margin_bottom_mm: 10,
    margin_left_mm: 10,
    margin_right_mm: 10,
    show_header: true,
    show_footer: true,
    logo_position: "left",
    show_signature: true,
    document_label: DOCUMENT_LABELS[documentType],
    party_label: PARTY_LABELS[documentType],
    show_hsn: isProductDoc,
    show_rate: isProductDoc,
    show_gst_summary: isProductDoc,
    show_amount: isProductDoc,
    show_discount: isProductDoc,
    show_transport_section: documentType === "delivery_challan",
    show_mrp: false,
    show_discount_column: false,
    show_warehouse: false,
    show_weight: false,
    language: "en",
    show_qr_code: false,
    purpose_text: documentType === "delivery_challan" ? "Sale on approval / Goods sent for delivery" : "",
    show_watermark: false,
    watermark_text: "",
    show_bank_details: false,
    bank_account_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_name: "",
    bank_branch: "",
    terms: "Goods once sold will not be taken back.\nE. & O.E.",
  };
}

function profileToForm(p: PrintProfile): FormState {
  return {
    name: p.name,
    template_id: p.template_id,
    page_size: p.page_size,
    orientation: p.orientation,
    margin_top_mm: p.margin_top_mm,
    margin_bottom_mm: p.margin_bottom_mm,
    margin_left_mm: p.margin_left_mm,
    margin_right_mm: p.margin_right_mm,
    show_header: p.show_header,
    show_footer: p.show_footer,
    logo_position: p.logo_position,
    show_signature: p.show_signature,
    document_label: p.document_label,
    party_label: p.party_label,
    show_hsn: p.show_hsn,
    show_rate: p.show_rate,
    show_gst_summary: p.show_gst_summary,
    show_amount: p.show_amount,
    show_discount: p.show_discount,
    show_transport_section: p.show_transport_section,
    show_mrp: p.show_mrp,
    show_discount_column: p.show_discount_column,
    show_warehouse: p.show_warehouse,
    show_weight: p.show_weight,
    language: p.language,
    show_qr_code: p.show_qr_code,
    purpose_text: p.purpose_text ?? "",
    show_watermark: p.show_watermark,
    watermark_text: p.watermark_text ?? "",
    show_bank_details: p.show_bank_details,
    bank_account_name: p.bank_details?.accountName ?? "",
    bank_account_number: p.bank_details?.accountNumber ?? "",
    bank_ifsc: p.bank_details?.ifsc ?? "",
    bank_name: p.bank_details?.bankName ?? "",
    bank_branch: p.bank_details?.branch ?? "",
    terms: (p.terms ?? []).join("\n"),
  };
}

function formToPayload(form: FormState, documentType: PrintDocumentType) {
  const isLedger = LEDGER_DOCUMENT_TYPES.includes(documentType);
  return {
    name: form.name,
    template_id: form.template_id,
    item_grid_mode: (isLedger ? "ledger" : "product") as "product" | "ledger",
    show_party: !isLedger,
    page_size: form.page_size,
    orientation: form.orientation,
    margin_top_mm: Number(form.margin_top_mm) || 0,
    margin_bottom_mm: Number(form.margin_bottom_mm) || 0,
    margin_left_mm: Number(form.margin_left_mm) || 0,
    margin_right_mm: Number(form.margin_right_mm) || 0,
    show_header: form.show_header,
    show_footer: form.show_footer,
    logo_position: form.logo_position,
    show_signature: form.show_signature,
    document_label: form.document_label,
    party_label: form.party_label,
    show_hsn: form.show_hsn,
    show_rate: form.show_rate,
    show_gst_summary: form.show_gst_summary,
    show_amount: form.show_amount,
    show_discount: form.show_discount,
    show_transport_section: form.show_transport_section,
    show_mrp: form.show_mrp,
    show_discount_column: form.show_discount_column,
    show_warehouse: form.show_warehouse,
    show_weight: form.show_weight,
    language: form.language,
    show_qr_code: form.show_qr_code,
    purpose_text: form.purpose_text || null,
    show_watermark: form.show_watermark,
    watermark_text: form.watermark_text || null,
    show_bank_details: form.show_bank_details,
    bank_details: form.show_bank_details ? {
      accountName: form.bank_account_name || undefined,
      accountNumber: form.bank_account_number || undefined,
      ifsc: form.bank_ifsc || undefined,
      bankName: form.bank_name || undefined,
      branch: form.bank_branch || undefined,
    } : null,
    terms: form.terms.split("\n").map((t) => t.trim()).filter(Boolean),
  };
}

export default function PrintProfiles() {
  useEffect(() => { document.title = "Print Profiles — RD Pro"; }, []);
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  const printPreference = usePrintPreference();
  const setPrintPreference = useSetPrintPreference();
  const shareLinkExpiry = useShareLinkExpiry();
  const updateShareLinkExpiry = async (expiry: ShareLinkExpiry) => {
    if (!business?.id) return;
    try {
      await setShareLinkExpiry(business.id, expiry);
      qc.invalidateQueries({ queryKey: ["share-link-expiry", business.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update share link expiry");
    }
  };

  const [documentType, setDocumentType] = useState<PrintDocumentType>("sales_invoice");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm("sales_invoice"));
  const [saving, setSaving] = useState(false);

  const list = useQuery({
    queryKey: ["print-profiles", business?.id, documentType],
    enabled: !!business?.id,
    queryFn: () => fetchPrintProfiles(business!.id, documentType),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["print-profiles", business?.id, documentType] });

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm(documentType));
    setDialogOpen(true);
  };

  const openEdit = (p: PrintProfile) => {
    setEditingId(p.id);
    setForm(profileToForm(p));
    setDialogOpen(true);
  };

  const save = async () => {
    if (!business?.id || !form.name.trim() || !form.document_label.trim()) return;
    setSaving(true);
    try {
      const payload = formToPayload(form, documentType);
      if (editingId) {
        await updatePrintProfile(editingId, payload);
        toast.success("Profile updated");
      } else {
        await createPrintProfile(business.id, documentType, payload);
        toast.success("Profile created");
      }
      setDialogOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: PrintProfile) => {
    if (p.is_default) { toast.error("Can't delete the default profile — set another as default first."); return; }
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      await deletePrintProfile(p.id);
      refresh();
      toast.success("Profile deleted");
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete profile");
    }
  };

  const makeDefault = async (p: PrintProfile) => {
    try {
      await setDefaultPrintProfile(p.id);
      refresh();
      toast.success(`"${p.name}" is now the default ${DOCUMENT_TYPES.find((d) => d.value === documentType)?.label} profile`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not set default");
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Print Profiles</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Page size, margins, sections, and watermark for each document type. The default profile is what prints
          when someone clicks Print — add more (e.g. a Thermal or GST Standard variant) and switch the default anytime.
        </p>
      </header>

      <section className="rounded-2xl bg-card border p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div>
            <h2 className="font-semibold text-sm">Default Print Action</h2>
            <p className="text-xs text-muted-foreground mt-1">
              What happens when you click the Print icon directly, or press Ctrl+P. The dropdown arrow always
              shows the full menu regardless of this setting. This is personal to your account.
            </p>
          </div>
          <RadioGroup
            value={printPreference}
            onValueChange={(v) => setPrintPreference(v as DefaultPrintAction)}
            className="space-y-2 mt-2"
          >
            {DEFAULT_PRINT_ACTION_OPTIONS.map((o) => (
              <div key={o.value} className="flex items-start gap-2">
                <RadioGroupItem value={o.value} id={`print-action-${o.value}`} className="mt-0.5" />
                <Label htmlFor={`print-action-${o.value}`} className="font-normal">
                  <span className="block">{o.label}</span>
                  <span className="block text-xs text-muted-foreground font-normal">{o.description}</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <div>
            <h2 className="font-semibold text-sm">Share Link Expiry</h2>
            <p className="text-xs text-muted-foreground mt-1">
              How long a PDF share link stays valid after you send it via Email or WhatsApp. Documents are never
              made public — the link is a signed, time-limited URL into private storage.
            </p>
          </div>
          <Select disabled={!editable} value={shareLinkExpiry} onValueChange={(v) => updateShareLinkExpiry(v as ShareLinkExpiry)}>
            <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SHARE_LINK_EXPIRY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="rounded-2xl bg-card border p-6 flex flex-col md:flex-row gap-3 items-end">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Document Type</Label>
          <Select value={documentType} onValueChange={(v) => setDocumentType(v as PrintDocumentType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {editable && (
          <Button onClick={openCreate}><PlusCircle className="h-4 w-4 mr-2" /> New Profile</Button>
        )}
      </section>

      <section className="rounded-2xl bg-card border p-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Document Label</TableHead>
                <TableHead>Page Size</TableHead>
                <TableHead>Orientation</TableHead>
                <TableHead>Default</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => editable && openEdit(p)}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.document_label}</TableCell>
                  <TableCell>{p.page_size}</TableCell>
                  <TableCell className="capitalize">{p.orientation}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {p.is_default ? (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                        <Star className="h-3 w-3 mr-1 fill-emerald-600" /> Default
                      </Badge>
                    ) : editable ? (
                      <Button size="sm" variant="ghost" onClick={() => makeDefault(p)}>Make default</Button>
                    ) : null}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {editable && !p.is_default && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(p)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!list.isLoading && (list.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No profiles yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Profile" : "New Profile"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Profile Name</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Classic" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Document Title (printed)</Label>
                <Input value={form.document_label} onChange={(e) => set("document_label", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Template</Label>
              <Select value={form.template_id} onValueChange={(v) => set("template_id", v as TemplateId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}{t.comingSoon ? " — coming soon (renders as Classic)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Which visual layout renders this profile. Modern/GST Standard/Custom are reserved for a future
                phase — picking them today would render as Classic.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Page Size</Label>
                <Select value={form.page_size} onValueChange={(v) => set("page_size", v as PrintPageSize)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Orientation</Label>
                <Select value={form.orientation} onValueChange={(v) => set("orientation", v as PrintOrientation)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Margin Top (mm)</Label><Input type="number" value={form.margin_top_mm} onChange={(e) => set("margin_top_mm", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Bottom (mm)</Label><Input type="number" value={form.margin_bottom_mm} onChange={(e) => set("margin_bottom_mm", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Left (mm)</Label><Input type="number" value={form.margin_left_mm} onChange={(e) => set("margin_left_mm", Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Right (mm)</Label><Input type="number" value={form.margin_right_mm} onChange={(e) => set("margin_right_mm", Number(e.target.value))} /></div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Language (fixed labels — column headers, section titles)</Label>
              <Select value={form.language} onValueChange={(v) => set("language", v as PrintLanguage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Party Block Label</Label>
                <Input value={form.party_label} onChange={(e) => set("party_label", e.target.value)} placeholder="BILL TO" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Logo Position</Label>
                <Select value={form.logo_position} onValueChange={(v) => set("logo_position", v as PrintLogoPosition)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="none">No logo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-lg border border-border p-3">
              {([
                ["show_header", "Header"], ["show_footer", "Footer"], ["show_signature", "Signature"],
                ["show_hsn", "HSN column"], ["show_rate", "Rate column"], ["show_amount", "Amount + totals"],
                ["show_discount", "Discount row"], ["show_gst_summary", "GST summary"], ["show_transport_section", "Transport details"],
                ["show_mrp", "MRP column"], ["show_discount_column", "Discount % column"], ["show_warehouse", "Warehouse column"],
                ["show_weight", "Weight column"], ["show_qr_code", "QR code"],
              ] as [keyof FormState, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Switch checked={form[key] as boolean} onCheckedChange={(v) => set(key, v as never)} />
                  <Label className="text-xs font-normal">{label}</Label>
                </div>
              ))}
            </div>

            {form.show_transport_section && (
              <div className="space-y-1.5">
                <Label className="text-xs">Purpose of Movement</Label>
                <Input value={form.purpose_text} onChange={(e) => set("purpose_text", e.target.value)} />
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Switch checked={form.show_watermark} onCheckedChange={(v) => set("show_watermark", v)} />
                <Label className="text-xs font-normal">Watermark</Label>
              </div>
              {form.show_watermark && (
                <Input value={form.watermark_text} onChange={(e) => set("watermark_text", e.target.value)} placeholder="DRAFT / DUPLICATE / CANCELLED" />
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Switch checked={form.show_bank_details} onCheckedChange={(v) => set("show_bank_details", v)} />
                <Label className="text-xs font-normal">Bank Details</Label>
              </div>
              {form.show_bank_details && (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} placeholder="Account Name" />
                  <Input value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)} placeholder="Account Number" />
                  <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="Bank Name" />
                  <Input value={form.bank_branch} onChange={(e) => set("bank_branch", e.target.value)} placeholder="Branch" />
                  <Input value={form.bank_ifsc} onChange={(e) => set("bank_ifsc", e.target.value)} placeholder="IFSC" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Terms & Conditions (one per line)</Label>
              <Textarea value={form.terms} onChange={(e) => set("terms", e.target.value)} className="h-20" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim() || !form.document_label.trim()}>
              {editingId ? "Save Changes" : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
