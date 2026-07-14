import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness, can } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";
import {
  Building2,
  FileText,
  MapPin,
  Phone,
  CreditCard,
  FileInvoice,
  Upload,
  X,
  ChevronRight,
  CheckCircle2,
  Lock,
  AlertCircle,
  Menu,
  X as XIcon
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

type SectionKey = "identity" | "tax" | "address" | "contact" | "bank" | "invoice";

const sections: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: "identity", label: "Identity", icon: <Building2 className="h-4 w-4" /> },
  { key: "tax", label: "Tax & Legal", icon: <FileText className="h-4 w-4" /> },
  { key: "address", label: "Address", icon: <MapPin className="h-4 w-4" /> },
  { key: "contact", label: "Contact", icon: <Phone className="h-4 w-4" /> },
  { key: "bank", label: "Bank", icon: <CreditCard className="h-4 w-4" /> },
  { key: "invoice", label: "Invoice", icon: <FileInvoice className="h-4 w-4" /> },
];

export default function BusinessProfile() {
  const { business, role, loading, refetch } = useBusiness();
  const nav = useNavigate();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionKey>("identity");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sectionRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({} as Record<SectionKey, HTMLDivElement | null>);
  const [originalForm, setOriginalForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    document.title = "Business Profile — RD Pro";
  }, []);

  useEffect(() => {
    if (business) {
      setForm({ ...business });
      setOriginalForm({ ...business });
    }
  }, [business]);

  const editable = can(role, "business.edit");
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm);

  const scrollToSection = (key: SectionKey) => {
    setActiveSection(key);
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const key = entry.target.getAttribute("data-section") as SectionKey;
            if (key) setActiveSection(key);
          }
        });
      },
      { threshold: 0.3, rootMargin: "-50px 0px -50px 0px" }
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { id, owner_id, created_at, archived_at, setup_completed, ...editableFields } = form as Record<string, unknown>;
      void id;
      void owner_id;
      void created_at;
      void archived_at;
      void setup_completed;

      const { error } = await supabase
        .from("businesses")
        .update(editableFields as never)
        .eq("id", business.id);
      if (error) throw error;
      await logAudit({
        business_id: business.id,
        action: "BUSINESS_UPDATE",
        entity_type: "business",
        entity_id: business.id,
        new_value: editableFields,
      });
      toast.success("Profile updated");
      await refetch();
      setOriginalForm({ ...form });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (business) {
      setForm({ ...business });
      setOriginalForm({ ...business });
      toast.info("Changes discarded");
    }
  };

  const f = form as Record<string, string | number | boolean | null>;

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!business) {
    return <EmptyState onSetup={() => nav("/setup/business")} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/50">
      {/* Hero Header */}
      <HeroHeader
        business={business}
        role={role}
        editable={editable}
        f={f}
        set={set}
      />

      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <SidebarNavigation
            activeSection={activeSection}
            scrollToSection={scrollToSection}
            mobileMenuOpen={mobileMenuOpen}
            setMobileMenuOpen={setMobileMenuOpen}
            hasChanges={hasChanges}
          />

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-6">
            <IdentitySection
              f={f}
              set={set}
              editable={editable}
              sectionRefs={sectionRefs}
              business={business}
            />

            <TaxSection
              f={f}
              set={set}
              editable={editable}
              sectionRefs={sectionRefs}
            />

            <AddressSection
              f={f}
              set={set}
              editable={editable}
              sectionRefs={sectionRefs}
            />

            <ContactSection
              f={f}
              set={set}
              editable={editable}
              sectionRefs={sectionRefs}
            />

            <BankSection
              f={f}
              set={set}
              editable={editable}
              sectionRefs={sectionRefs}
            />

            <InvoiceSection
              f={f}
              set={set}
              editable={editable}
              sectionRefs={sectionRefs}
            />
          </div>
        </div>
      </div>

      {/* Sticky Save Bar */}
      <StickySaveBar
        hasChanges={hasChanges}
        saving={saving}
        onSave={save}
        onCancel={handleCancel}
        editable={editable}
      />
    </div>
  );
}

// --- Sub-Components ---

function HeroHeader({
  business,
  role,
  editable,
  f,
  set,
}: {
  business: any;
  role: string;
  editable: boolean;
  f: Record<string, string | number | boolean | null>;
  set: (k: string, v: unknown) => void;
}) {
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-b">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Logo */}
          <div
            className="relative flex-shrink-0"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white shadow-lg border flex items-center justify-center overflow-hidden">
              {f.logo_url ? (
                <img
                  src={f.logo_url as string}
                  alt="Business Logo"
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <Building2 className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            {editable && (
              <div
                className={cn(
                  "absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center transition-opacity cursor-pointer",
                  isHovering ? "opacity-100" : "opacity-0"
                )}
              >
                <Upload className="w-6 h-6 text-white" />
              </div>
            )}
          </div>

          {/* Business Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate">
                {f.business_name || "Unnamed Business"}
              </h1>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Active
              </Badge>
              {!editable && (
                <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
                  <Lock className="w-3 h-3 mr-1" />
                  Read-only
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
              {f.firm_name && <span className="truncate">{f.firm_name}</span>}
              {f.business_type && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span>{f.business_type}</span>
                </>
              )}
              {f.industry_segment && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span>{f.industry_segment}</span>
                </>
              )}
              {f.gst_number && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="font-mono">GST: {f.gst_number}</span>
                </>
              )}
            </div>
          </div>

          {/* Role Badge */}
          <div className="flex-shrink-0">
            <Badge variant="secondary" className="text-xs bg-white/80 backdrop-blur-sm shadow-sm">
              {role}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarNavigation({
  activeSection,
  scrollToSection,
  mobileMenuOpen,
  setMobileMenuOpen,
  hasChanges,
}: {
  activeSection: SectionKey;
  scrollToSection: (key: SectionKey) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  hasChanges: boolean;
}) {
  return (
    <>
      {/* Mobile Menu Toggle */}
      <div className="lg:hidden sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b p-4 -mt-4 -mx-4 px-4">
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span>Navigate</span>
          {mobileMenuOpen ? <XIcon className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Sidebar */}
      <div
        className={cn(
          "lg:sticky lg:top-8 lg:self-start transition-all duration-300",
          mobileMenuOpen ? "block" : "hidden lg:block"
        )}
      >
        <nav className="w-48 lg:w-56 space-y-1 bg-white/80 backdrop-blur-sm rounded-xl border p-2 shadow-sm">
          {sections.map((section) => (
            <button
              key={section.key}
              onClick={() => scrollToSection(section.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group text-sm",
                activeSection === section.key
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {section.icon}
              <span className="flex-1 text-left font-medium">{section.label}</span>
              {hasChanges && activeSection === section.key && (
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              )}
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform",
                  activeSection === section.key ? "opacity-100" : "opacity-0 group-hover:opacity-50"
                )}
              />
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}

function Section({
  id,
  icon,
  title,
  subtitle,
  children,
  sectionRefs,
}: {
  id: SectionKey;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  sectionRefs: React.MutableRefObject<Record<SectionKey, HTMLDivElement | null>>;
}) {
  return (
    <div
      ref={(el) => (sectionRefs.current[id] = el)}
      data-section={id}
      className="scroll-mt-24"
    >
      <div className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-lg bg-primary/5 text-primary">{icon}</div>
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <p className="text-sm text-muted-foreground ml-12">{subtitle}</p>
          <Separator className="mt-4 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  description,
  required,
  fullWidth,
  children,
}: {
  label: string;
  description?: string;
  required?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", fullWidth && "md:col-span-2")}>
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// --- Section Components ---

function IdentitySection({
  f,
  set,
  editable,
  sectionRefs,
  business,
}: {
  f: Record<string, string | number | boolean | null>;
  set: (k: string, v: unknown) => void;
  editable: boolean;
  sectionRefs: React.MutableRefObject<Record<SectionKey, HTMLDivElement | null>>;
  business: any;
}) {
  return (
    <Section
      id="identity"
      icon={<Building2 className="h-5 w-5" />}
      title="Identity"
      subtitle="Basic information about your business"
      sectionRefs={sectionRefs}
    >
      <FormField label="Business Name" required>
        <Input
          disabled={!editable}
          value={(f.business_name as string) || ""}
          onChange={(e) => set("business_name", e.target.value)}
          placeholder="Enter business name"
          className="h-10"
        />
      </FormField>

      <FormField label="Firm Name" description="Legal registered name">
        <Input
          disabled={!editable}
          value={(f.firm_name as string) || ""}
          onChange={(e) => set("firm_name", e.target.value)}
          placeholder="Enter firm name"
          className="h-10"
        />
      </FormField>

      <FormField label="Business Type">
        <Input
          disabled={!editable}
          value={(f.business_type as string) || ""}
          onChange={(e) => set("business_type", e.target.value)}
          placeholder="e.g., Private Limited, Partnership"
          className="h-10"
        />
      </FormField>

      <FormField label="Industry">
        <Input
          disabled={!editable}
          value={(f.industry_segment as string) || ""}
          onChange={(e) => set("industry_segment", e.target.value)}
          placeholder="e.g., Manufacturing, IT Services"
          className="h-10"
        />
      </FormField>
    </Section>
  );
}

function TaxSection({
  f,
  set,
  editable,
  sectionRefs,
}: {
  f: Record<string, string | number | boolean | null>;
  set: (k: string, v: unknown) => void;
  editable: boolean;
  sectionRefs: React.MutableRefObject<Record<SectionKey, HTMLDivElement | null>>;
}) {
  return (
    <Section
      id="tax"
      icon={<FileText className="h-5 w-5" />}
      title="Tax & Legal"
      subtitle="Tax registration and compliance details"
      sectionRefs={sectionRefs}
    >
      <FormField label="GST Number" description="Used in invoices and GST reporting">
        <Input
          disabled={!editable}
          value={(f.gst_number as string) || ""}
          onChange={(e) => set("gst_number", e.target.value.toUpperCase())}
          placeholder="e.g., 22AAAAA0000A1Z5"
          className="h-10 font-mono"
        />
      </FormField>

      <FormField label="PAN Number">
        <Input
          disabled={!editable}
          value={(f.pan_number as string) || ""}
          onChange={(e) => set("pan_number", e.target.value.toUpperCase())}
          placeholder="e.g., AAAAA1234A"
          className="h-10 font-mono"
        />
      </FormField>

      <FormField label="TAN Number">
        <Input
          disabled={!editable}
          value={(f.tan_number as string) || ""}
          onChange={(e) => set("tan_number", e.target.value.toUpperCase())}
          placeholder="e.g., BBNP12345A"
          className="h-10 font-mono"
        />
      </FormField>

      <FormField label="MSME / Udyam Registration">
        <Input
          disabled={!editable}
          value={(f.msme_number as string) || ""}
          onChange={(e) => set("msme_number", e.target.value)}
          placeholder="Enter registration number"
          className="h-10"
        />
      </FormField>
    </Section>
  );
}

function AddressSection({
  f,
  set,
  editable,
  sectionRefs,
}: {
  f: Record<string, string | number | boolean | null>;
  set: (k: string, v: unknown) => void;
  editable: boolean;
  sectionRefs: React.MutableRefObject<Record<SectionKey, HTMLDivElement | null>>;
}) {
  return (
    <Section
      id="address"
      icon={<MapPin className="h-5 w-5" />}
      title="Address"
      subtitle="Business location and contact address"
      sectionRefs={sectionRefs}
    >
      <FormField label="Address" fullWidth>
        <Textarea
          disabled={!editable}
          value={(f.address as string) || ""}
          onChange={(e) => set("address", e.target.value)}
          placeholder="Enter street address"
          rows={3}
          className="resize-none"
        />
      </FormField>

      <FormField label="City">
        <Input
          disabled={!editable}
          value={(f.city as string) || ""}
          onChange={(e) => set("city", e.target.value)}
          placeholder="Enter city"
          className="h-10"
        />
      </FormField>

      <FormField label="District">
        <Input
          disabled={!editable}
          value={(f.district as string) || ""}
          onChange={(e) => set("district", e.target.value)}
          placeholder="Enter district"
          className="h-10"
        />
      </FormField>

      <FormField label="State">
        <Input
          disabled={!editable}
          value={(f.state as string) || ""}
          onChange={(e) => set("state", e.target.value)}
          placeholder="Enter state"
          className="h-10"
        />
      </FormField>

      <FormField label="Pincode">
        <Input
          disabled={!editable}
          value={(f.pincode as string) || ""}
          onChange={(e) => set("pincode", e.target.value)}
          placeholder="Enter pincode"
          className="h-10 font-mono"
        />
      </FormField>
    </Section>
  );
}

function ContactSection({
  f,
  set,
  editable,
  sectionRefs,
}: {
  f: Record<string, string | number | boolean | null>;
  set: (k: string, v: unknown) => void;
  editable: boolean;
  sectionRefs: React.MutableRefObject<Record<SectionKey, HTMLDivElement | null>>;
}) {
  return (
    <Section
      id="contact"
      icon={<Phone className="h-5 w-5" />}
      title="Contact"
      subtitle="Business contact information"
      sectionRefs={sectionRefs}
    >
      <FormField label="Owner / Proprietor">
        <Input
          disabled={!editable}
          value={(f.owner_name as string) || ""}
          onChange={(e) => set("owner_name", e.target.value)}
          placeholder="Enter owner name"
          className="h-10"
        />
      </FormField>

      <FormField label="Mobile Number">
        <Input
          disabled={!editable}
          value={(f.mobile as string) || ""}
          onChange={(e) => set("mobile", e.target.value)}
          placeholder="Enter mobile number"
          className="h-10"
        />
      </FormField>

      <FormField label="Email Address">
        <Input
          disabled={!editable}
          value={(f.email as string) || ""}
          onChange={(e) => set("email", e.target.value)}
          placeholder="Enter email"
          className="h-10"
          type="email"
        />
      </FormField>

      <FormField label="Website">
        <Input
          disabled={!editable}
          value={(f.website as string) || ""}
          onChange={(e) => set("website", e.target.value)}
          placeholder="https://example.com"
          className="h-10"
        />
      </FormField>
    </Section>
  );
}

function BankSection({
  f,
  set,
  editable,
  sectionRefs,
}: {
  f: Record<string, string | number | boolean | null>;
  set: (k: string, v: unknown) => void;
  editable: boolean;
  sectionRefs: React.MutableRefObject<Record<SectionKey, HTMLDivElement | null>>;
}) {
  return (
    <Section
      id="bank"
      icon={<CreditCard className="h-5 w-5" />}
      title="Bank Details"
      subtitle="Bank account information for payments"
      sectionRefs={sectionRefs}
    >
      <FormField label="Bank Name">
        <Input
          disabled={!editable}
          value={(f.bank_name as string) || ""}
          onChange={(e) => set("bank_name", e.target.value)}
          placeholder="Enter bank name"
          className="h-10"
        />
      </FormField>

      <FormField label="Account Number">
        <Input
          disabled={!editable}
          value={(f.bank_account_number as string) || ""}
          onChange={(e) => set("bank_account_number", e.target.value)}
          placeholder="Enter account number"
          className="h-10 font-mono"
        />
      </FormField>

      <FormField label="IFSC Code">
        <Input
          disabled={!editable}
          value={(f.bank_ifsc as string) || ""}
          onChange={(e) => set("bank_ifsc", e.target.value.toUpperCase())}
          placeholder="e.g., SBIN0001234"
          className="h-10 font-mono"
        />
      </FormField>

      <FormField label="Bank Branch">
        <Input
          disabled={!editable}
          value={(f.bank_branch as string) || ""}
          onChange={(e) => set("bank_branch", e.target.value)}
          placeholder="Enter branch name"
          className="h-10"
        />
      </FormField>
    </Section>
  );
}

function InvoiceSection({
  f,
  set,
  editable,
  sectionRefs,
}: {
  f: Record<string, string | number | boolean | null>;
  set: (k: string, v: unknown) => void;
  editable: boolean;
  sectionRefs: React.MutableRefObject<Record<SectionKey, HTMLDivElement | null>>;
}) {
  return (
    <Section
      id="invoice"
      icon={<FileInvoice className="h-5 w-5" />}
      title="Invoice Settings"
      subtitle="Customize your invoice generation"
      sectionRefs={sectionRefs}
    >
      <FormField label="Invoice Prefix" description="Used for invoice numbering">
        <Input
          disabled={!editable}
          value={(f.invoice_prefix as string) || ""}
          onChange={(e) => set("invoice_prefix", e.target.value)}
          placeholder="e.g., INV-"
          className="h-10"
        />
      </FormField>

      <FormField label="Terms & Conditions" fullWidth>
        <Textarea
          disabled={!editable}
          value={(f.invoice_terms as string) || ""}
          onChange={(e) => set("invoice_terms", e.target.value)}
          placeholder="Enter terms and conditions for invoices"
          rows={4}
          className="resize-none"
        />
      </FormField>
    </Section>
  );
}

function StickySaveBar({
  hasChanges,
  saving,
  onSave,
  onCancel,
  editable,
}: {
  hasChanges: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  editable: boolean;
}) {
  if (!editable || !hasChanges) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t shadow-lg">
      <div className="container max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>You have unsaved changes</span>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={saving}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              disabled={saving}
              className="flex-1 sm:flex-none bg-primary hover:bg-primary/90"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/50">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-56">
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50/50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6 animate-fade-in-up">
        <div className="w-24 h-24 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <Building2 className="w-12 h-12 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">No Business Found</h2>
          <p className="text-muted-foreground">
            Complete your business setup to start managing your profile and invoices.
          </p>
        </div>
        <Button onClick={onSetup} className="min-w-[200px]">
          Open Setup
        </Button>
      </div>
    </div>
  );
}
