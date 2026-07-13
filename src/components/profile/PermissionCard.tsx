import { Permission } from "@/hooks/useProfileData";
import { CheckCircle, Circle, ShieldCheck } from "lucide-react";

interface Props {
  permissions: Permission[];
}

const PermissionCard = ({ permissions }: Props) => {
  const getIcon = (access: string) => {
    if (access === "admin") return <ShieldCheck className="h-4 w-4 text-primary" />;
    if (access === "write") return <CheckCircle className="h-4 w-4 text-success" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  const getAccessLabel = (access: string) => {
    const map: Record<string, string> = {
      readonly: "Readonly",
      write: "Write",
      admin: "Admin",
    };
    return map[access] || access;
  };

  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-6">
      <h4 className="text-sm font-medium text-muted-foreground mb-4">Permissions</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {permissions.map((p) => (
          <div key={p.module} className="flex items-center gap-2 text-sm">
            {getIcon(p.access)}
            <span>{p.module}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {getAccessLabel(p.access)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PermissionCard;
