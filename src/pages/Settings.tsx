import { useNavigate } from "react-router-dom";
import { useBusiness } from "@/hooks/useBusiness";
import {
  Building2, Users, Hash, SlidersHorizontal, UserCog,
  ChevronRight,
} from "lucide-react";

const items = [
  {
    to: "/settings/business-profile",
    icon: Building2,
    title: "Business Profile",
    desc: "Company name, GST, address, bank details, invoice prefix",
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
    to: "/settings/team",
    icon: Users,
    title: "Team & Roles",
    desc: "Invite team members and manage their roles",
  },
  {
    to: "/settings/company-users",
    icon: UserCog,
    title: "Company Users",
    desc: "View all users with access to this company",
  },
];

export default function Settings() {
  const navigate = useNavigate();
  const { business } = useBusiness();

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
    </div>
  );
}
