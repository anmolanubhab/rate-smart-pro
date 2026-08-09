import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import { fetchSalesmanPortalProfile, updateSalesmanPortalProfile } from "@/lib/salesmanPortal/profile";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

export default function SalesmanProfile() {
  useEffect(() => { document.title = "Profile — Salesman Portal"; }, []);
  const { salesmanUser } = useSalesmanAuth();
  const salesmanId = salesmanUser?.salesman_id;
  const businessId = salesmanUser?.business_id;
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["salesman-portal-profile", salesmanId],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchSalesmanPortalProfile(salesmanId!, businessId!),
  });

  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setPhone(profile?.phone ?? "");
    setEmail(profile?.email ?? "");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateSalesmanPortalProfile(phone, email);
      toast.success("Profile updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["salesman-portal-profile", salesmanId] });
      qc.invalidateQueries({ queryKey: ["salesman-portal-self", salesmanId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !profile) {
    return <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>;
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Profile</h1>
        {profile.is_active ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={profile.name} />
        <Field label="Employee Code" value={profile.employee_code ?? "—"} />
        <Field label="Salesman Group" value={profile.group_name ?? "—"} />
        <Field label="Business" value={profile.business_name ?? "—"} />
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Contact Details</p>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Phone</div>
              <div className="mt-0.5">{profile.phone ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="mt-0.5 truncate">{profile.email ?? "—"}</div>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Name, employee code, salesman group and business are managed by your admin.
      </p>
    </div>
  );
}
