import { Briefcase, Calendar } from "lucide-react";
import { Business } from "@/hooks/useProfileData";
import CompanyAvatar from "@/components/company/CompanyAvatar";

interface Props {
  business?: Business | null;
  role?: string | null;
}

const CompanyCard = ({ business, role }: Props) => {
  if (!business) {
    return (
      <div className="rounded-2xl bg-card border border-border shadow-soft p-6 text-muted-foreground">
        No company associated.
      </div>
    );
  }

  const displayName = business.business_name || business.name || "Unnamed Company";
  const financialYear = business.financial_year_start && business.financial_year_end
    ? `${business.financial_year_start} – ${business.financial_year_end}`
    : "Not set";

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6 md:p-8">
      <div className="flex items-start gap-4">
        <CompanyAvatar company={{ business_name: displayName, logo_url: business.logo_url }} size="md" clickable />
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-lg font-semibold">{displayName}</h3>
          <p className="text-sm text-muted-foreground">{business.business_type || business.legal_type || "Company"}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Briefcase className="h-4 w-4" />
          <span>Role: <span className="font-medium text-foreground capitalize">{role || "Member"}</span></span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>Financial Year: <span className="font-medium text-foreground">{financialYear}</span></span>
        </div>
      </div>
    </div>
  );
};

export default CompanyCard;
