import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { fetchPermissionMode, setPermissionMode, type PermissionMode } from "@/lib/permissionMode";
import { logAudit } from "@/lib/audit";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const MODES: { value: PermissionMode; title: string; tag: string; description: string }[] = [
  {
    value: "individual",
    title: "Individual User Permissions",
    tag: "Recommended for SME",
    description: "Each user's permissions are managed separately. Role is only a designation.",
  },
  {
    value: "role_based",
    title: "Role Based Permissions",
    tag: "Enterprise",
    description: "Permissions are inherited from Roles. Users get access based on their assigned role.",
  },
];

export default function PermissionSystem() {
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "team.manage", permissions);

  useEffect(() => { document.title = "Permission System — RD Pro"; }, []);

  const { data: mode, isLoading } = useQuery({
    queryKey: ["permission-mode", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchPermissionMode(business!.id),
  });

  const updateMode = async (next: PermissionMode) => {
    if (!business?.id) return;
    try {
      await setPermissionMode(business.id, next);
      await logAudit({ business_id: business.id, action: "PERMISSION_MODE_UPDATE", entity_type: "accounting_settings", new_value: { permission_mode: next } });
      toast.success(next === "role_based" ? "Switched to Role Based Permissions" : "Switched to Individual User Permissions");
      qc.invalidateQueries({ queryKey: ["permission-mode", business.id] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update permission mode");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings · Security</p>
        <h1 className="font-display text-3xl font-bold mt-1">Permission System</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Choose how permissions work for this company. Both modes use the same underlying
          permissions — this only changes how Company Users presents and manages them.
        </p>
      </header>

      <section className="rounded-2xl bg-card border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Permission Management</h2>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : (
          <RadioGroup
            value={mode}
            onValueChange={(v) => updateMode(v as PermissionMode)}
            className="space-y-3"
          >
            {MODES.map((m) => (
              <label
                key={m.value}
                htmlFor={`mode-${m.value}`}
                className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                  mode === m.value ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                } ${!editable ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <RadioGroupItem value={m.value} id={`mode-${m.value}`} disabled={!editable} className="mt-1" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{m.title}</span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {m.tag}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        )}

        {!editable && (
          <p className="text-xs text-muted-foreground">
            You don't have permission to change this. Contact an owner or admin.
          </p>
        )}
      </section>
    </div>
  );
}
