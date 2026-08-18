import { useNavigate } from "react-router-dom";
import { useBusiness } from "@/hooks/useBusiness";
import { isOwner as isOwnerRole, canAccessMaintenance } from "@/lib/permissions";
import {
  Building2, Hash, SlidersHorizontal, UserCog, Handshake,
  ChevronRight, ShieldAlert, ShieldCheck, Ruler, Tags, Wrench, Calculator, CalendarClock, ArrowLeftRight,
} from "lucide-react";

const items = [
  {
    to: "/settings/business-profile",
    icon: Building2,
    title: "Business Profile",
    desc: "Company name, GST, address, bank details, invoice prefix",
  },
  {
    to: "/settings/measurement-units",
    icon: Ruler,
    title: "Measurement Units",
    desc: "Manage units, categories and conversions used across Purchase, Sales & Inventory",
  },
  {
    to: "/settings/sales-config",
    icon: SlidersHorizontal,
    title: "Sales Configuration",
    desc: "Enable/disable order approval, dispatch module, packing slip, e-way bill",
  },
  {
    to: "/settings/voucher-numbering",
    icon: Hash,
    title: "Voucher Numbering",
    desc: "Set prefix and starting number for orders, invoices, dispatches, vouchers",
  },
  {
    to: "/settings/financial-note-categories",
    icon: Tags,
    title: "Financial Note Categories",
    desc: "Freight, Discount, Commission and other Debit/Credit Note adjustment categories",
  },
  {
    to: "/settings/accounting-lock",
    icon: ShieldAlert,
    title: "Accounting Lock",
    desc: "Lock a date to prevent edits before it, and configure Financial Adjustment note defaults",
  },
  {
    to: "/settings/financial-years",
    icon: CalendarClock,
    title: "Financial Years",
    desc: "Open/close financial years — a closed year blocks new posting and posted-voucher deletion inside it",
  },
  {
    to: "/settings/opening-balance-migration",
    icon: ArrowLeftRight,
    title: "Opening Balance / Migration",
    desc: "Migrate closing balances from Tally/Busy/Easy into RD Pro as reconciled opening balances",
  },
  {
    to: "/settings/round-off",
    icon: Calculator,
    title: "Round Off",
    desc: "Enable rounding on invoice totals, choose the rounding method, and pick which vouchers apply it",
  },
  {
    to: "/settings/company-users",
    icon: UserCog,
    title: "Company Users",
    desc: "View all users with access to this company",
  },
  {
    to: "/settings/dealer-applications",
    icon: Handshake,
    title: "Dealer Applications",
    desc: "Review and approve dealer/wholesaler portal signup requests",
  },
];

const securityItems = [
  {
    to: "/settings/permission-system",
    icon: ShieldCheck,
    title: "Permission System",
    desc: "Choose how permissions work for this company — Individual or Role Based",
  },
];

export default function Settings() {
  const navigate = useNavigate();
  const { business, role } = useBusiness();
  const isOwner = isOwnerRole(role);
  const canMaintain = canAccessMaintenance(role);


  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        {business && (
          <p className="text-sm text-muted-foreground mt-1">{business.business_name}</p>
        )}
      </div>

      <div className="divide-y divide-border rounded-xl border bg-card shadow-sm overflow-hidden">
        {items.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <item.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{item.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>
        ))}
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">Security</h2>
        <div className="divide-y divide-border rounded-xl border bg-card shadow-sm overflow-hidden">
          {securityItems.map((item) => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.desc}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {canMaintain && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">Administration</h2>
          <div className="divide-y divide-border rounded-xl border bg-card shadow-sm overflow-hidden">
            <button
              onClick={() => navigate("/settings/maintenance")}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Wrench className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">Maintenance</div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">Rebuild ledger balances and other data-recovery actions (Owner/Admin only)</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 overflow-hidden">
          <button
            onClick={() => navigate("/settings/danger-zone")}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-destructive/10 transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-destructive">Danger Zone</div>
              <div className="text-xs text-muted-foreground mt-0.5">Archive or permanently delete this company (owner only)</div>
            </div>
            <ChevronRight className="h-4 w-4 text-destructive flex-shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
}
