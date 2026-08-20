import { useNavigate } from "react-router-dom";
import { useBusiness } from "@/hooks/useBusiness";
import { isOwner as isOwnerRole, canAccessMaintenance } from "@/lib/permissions";
import {
  Building2, Hash, SlidersHorizontal, UserCog, Handshake,
  ChevronRight, ShieldAlert, ShieldCheck, Ruler, Tags, Wrench, Calculator, CalendarClock, ArrowLeftRight,
  DatabaseBackup, ScrollText, Settings as SettingsIcon,
} from "lucide-react";

type NavItem = {
  to: string;
  icon: typeof Building2;
  title: string;
  desc: string;
};

const businessProfileItem: NavItem[] = [
  {
    to: "/settings/business-profile",
    icon: Building2,
    title: "Business Profile",
    desc: "Company name, GST, address, bank details, invoice prefix",
  },
];

const usersAccessItems: NavItem[] = [
  {
    to: "/settings/company-users",
    icon: UserCog,
    title: "Company Users",
    desc: "View all users with access to this company",
  },
  {
    to: "/settings/permission-system",
    icon: ShieldCheck,
    title: "Permission System",
    desc: "Choose how permissions work for this company — Individual or Role Based",
  },
];

const configSalesItems: NavItem[] = [
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
    to: "/settings/round-off",
    icon: Calculator,
    title: "Round Off",
    desc: "Enable rounding on invoice totals, choose the rounding method, and pick which vouchers apply it",
  },
];

const configInventoryItems: NavItem[] = [
  {
    to: "/settings/measurement-units",
    icon: Ruler,
    title: "Measurement Units",
    desc: "Manage units, categories and conversions used across Purchase, Sales & Inventory",
  },
  {
    to: "/settings/inventory",
    icon: SettingsIcon,
    title: "Inventory Settings",
    desc: "Bin management and warehouse feature toggles used by GRN, Dispatch, Stock Transfer, Stock Take, and Picking List",
  },
];

const configAccountingItems: NavItem[] = [
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
];

function NavGroup({ items, onNavigate }: { items: NavItem[]; onNavigate: (to: string) => void }) {
  return (
    <div className="divide-y divide-border rounded-xl border bg-card shadow-sm overflow-hidden">
      {items.map((item) => (
        <button
          key={item.to}
          onClick={() => onNavigate(item.to)}
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
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">{title}</h2>
      {children}
    </div>
  );
}

function SubSection({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate: (to: string) => void }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-medium text-muted-foreground/80 px-1">{title}</h3>
      <NavGroup items={items} onNavigate={onNavigate} />
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { business, role } = useBusiness();
  const isOwner = isOwnerRole(role);
  const canMaintain = canAccessMaintenance(role);

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        {business && (
          <p className="text-sm text-muted-foreground mt-1">{business.business_name}</p>
        )}
      </div>

      <Section title="Settings">
        <div className="space-y-4">
          <NavGroup items={businessProfileItem} onNavigate={navigate} />
          <SubSection title="Users & Access" items={usersAccessItems} onNavigate={navigate} />
        </div>
      </Section>

      <Section title="Configuration">
        <div className="space-y-4">
          <SubSection title="Sales" items={configSalesItems} onNavigate={navigate} />
          <SubSection title="Inventory" items={configInventoryItems} onNavigate={navigate} />
          <SubSection title="Accounting" items={configAccountingItems} onNavigate={navigate} />
        </div>
      </Section>

      <Section title="Administration">
        <div className="space-y-4">
          <SubSection
            title="Data Management"
            items={[
              {
                to: "/settings/opening-balance-migration",
                icon: ArrowLeftRight,
                title: "Opening Balance / Migration",
                desc: "Migrate closing balances from Tally/Busy/Easy into RD Pro as reconciled opening balances",
              },
            ]}
            onNavigate={navigate}
          />

          {canMaintain && (
            <NavGroup
              items={[
                {
                  to: "/settings/maintenance",
                  icon: Wrench,
                  title: "Maintenance",
                  desc: "Rebuild ledger balances and other data-recovery actions (Owner/Admin only)",
                },
              ]}
              onNavigate={navigate}
            />
          )}

          {isOwner && (
            <NavGroup
              items={[
                {
                  to: "/settings/backup-restore",
                  icon: DatabaseBackup,
                  title: "Backup & Restore",
                  desc: "Create encrypted backups, download them, or restore into a new company (owner only)",
                },
                {
                  to: "/admin/audit-logs",
                  icon: ScrollText,
                  title: "Audit",
                  desc: "Full activity log of who did what and when across this company (owner only)",
                },
              ]}
              onNavigate={navigate}
            />
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
      </Section>

      <Section title="Dealer Portal">
        <NavGroup
          items={[
            {
              to: "/settings/dealer-applications",
              icon: Handshake,
              title: "Dealer Applications",
              desc: "Review and approve dealer/wholesaler portal signup requests",
            },
          ]}
          onNavigate={navigate}
        />
      </Section>
    </div>
  );
}
