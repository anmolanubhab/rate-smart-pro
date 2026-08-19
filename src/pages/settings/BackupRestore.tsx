import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, DatabaseBackup, Download, Upload, ShieldCheck, Trash2, ShieldAlert } from "lucide-react";
import { isOwner } from "@/lib/permissions";
import { useFormatDate } from "@/lib/dateFormat";
import { CreateBackupDialog } from "@/components/backup/CreateBackupDialog";
import { RestoreWizard } from "@/components/backup/RestoreWizard";

type BackupRow = {
  id: string;
  storage_path: string | null;
  file_size_bytes: number | null;
  backup_type: "manual" | "scheduled";
  status: "pending" | "completed" | "failed" | "deleted";
  created_by: string | null;
  created_at: string;
  error_message: string | null;
};

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

const STATUS_VARIANT: Record<BackupRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  pending: "secondary",
  failed: "destructive",
  deleted: "outline",
};

export default function BackupRestore() {
  const { business, role, loading } = useBusiness();
  const fd = useFormatDate();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [openRestore, setOpenRestore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { document.title = "Backup & Restore — RD Pro"; }, []);

  const backups = useQuery({
    queryKey: ["business-backups", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_backups" as never)
        .select("*")
        .eq("business_id", business!.id)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as BackupRow[];
    },
  });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!business) return <div className="p-8">No company selected.</div>;
  if (!isOwner(role)) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 flex gap-3">
          <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
          <div>
            <h1 className="font-semibold">Owner access required</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Only the company owner can access backups. Your current role is <span className="font-mono">{role}</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : undefined;
  };

  const download = async (row: BackupRow) => {
    if (!row.storage_path) return;
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.storage.from("business-backups").download(row.storage_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${business.business_name.replace(/[^a-z0-9]+/gi, "-")}-${row.id.slice(0, 8)}.rdbak`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  };

  const verify = async (row: BackupRow) => {
    if (!row.storage_path) return;
    setBusyId(row.id);
    try {
      const { data: blob, error: dlError } = await supabase.storage.from("business-backups").download(row.storage_path);
      if (dlError) throw dlError;
      const envelope = JSON.parse(await blob.text());
      const { data, error: fnError } = await supabase.functions.invoke("backup-restore", {
        body: { action: "validate", envelope },
        headers: await authHeader(),
      });
      if (fnError) throw fnError;
      if (data.validation_result?.valid) {
        toast.success("Backup verified — file is intact and restorable");
      } else {
        toast.error(`Backup has issues: ${data.validation_result?.errors?.join(", ")}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: BackupRow) => {
    if (!confirm("Delete this backup permanently? This cannot be undone.")) return;
    setBusyId(row.id);
    try {
      if (row.storage_path) {
        await supabase.storage.from("business-backups").remove([row.storage_path]);
      }
      const { error } = await supabase.rpc("delete_backup" as never, { _backup_id: row.id } as never);
      if (error) throw error;
      toast.success("Backup deleted");
      qc.invalidateQueries({ queryKey: ["business-backups"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <button onClick={() => nav("/settings")} className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to Settings
      </button>

      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <DatabaseBackup className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Backup & Restore</h1>
            <p className="text-sm text-muted-foreground">{business.business_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenRestore(true)}>
            <Upload className="h-4 w-4 mr-2" /> Restore
          </Button>
          <Button onClick={() => setOpenCreate(true)}>
            <DatabaseBackup className="h-4 w-4 mr-2" /> Create Backup
          </Button>
        </div>
      </header>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Size</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(backups.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{fd(row.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSize(row.file_size_bytes)}</td>
                  <td className="px-4 py-3 capitalize">{row.backup_type}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[row.status]} title={row.error_message ?? undefined}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" disabled={busyId === row.id || row.status !== "completed"} onClick={() => verify(row)}>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verify
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === row.id || row.status !== "completed"} onClick={() => download(row)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Download
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busyId === row.id} onClick={() => remove(row)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {backups.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No backups yet. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreateBackupDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        businessId={business.id}
        onCreated={() => qc.invalidateQueries({ queryKey: ["business-backups"] })}
      />
      <RestoreWizard open={openRestore} onOpenChange={setOpenRestore} />
    </div>
  );
}
