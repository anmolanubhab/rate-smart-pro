import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setActiveBusinessId } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Building2, Plus, Search, LogOut, MoreVertical, Pencil, Users, Settings, Archive, Trash2, ArchiveRestore } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

type Row = {
  business_id: string;
  role: string;
  status: string;
  businesses: {
    id: string;
    business_name: string;
    business_type: string | null;
    gst_number: string | null;
    fy_start_month: number;
    setup_completed: boolean;
    created_at: string;
    archived_at: string | null;
  } | null;
};

const monthName = (m: number) =>
  ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(m - 1) % 12];

const currentFY = (startMonth: number) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = m >= startMonth ? y : y - 1;
  return `${monthName(startMonth)} ${start} – ${monthName(startMonth - 1 < 1 ? 12 : startMonth - 1)} ${start + 1}`;
};

export default function CompanySelection() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ kind: "archive" | "delete"; id: string; name: string; txCount: number } | null>(null);

  useEffect(() => { document.title = "Select Company — RD Pro"; }, []);

  const q = useQuery({
    queryKey: ["company-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_users")
        .select("business_id, role, status, businesses:business_id ( id, business_name, business_type, gst_number, fy_start_month, setup_completed, created_at, archived_at )")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const all = (q.data ?? []).filter((r) => r.businesses);
    const visible = all.filter((r) => (showArchived ? !!r.businesses!.archived_at : !r.businesses!.archived_at));
    if (!search.trim()) return visible;
    const s = search.toLowerCase();
    return visible.filter((r) =>
      (r.businesses!.business_name?.toLowerCase().includes(s)) ||
      (r.businesses!.gst_number ?? "").toLowerCase().includes(s) ||
      (r.businesses!.business_type ?? "").toLowerCase().includes(s)
    );
  }, [q.data, search, showArchived]);

  const openCompany = async (id: string, name: string) => {
    setActiveBusinessId(id);
    await logAudit({ business_id: id, action: "COMPANY_OPENED", entity_type: "business", entity_id: id, new_value: { name } });
    nav("/dashboard");
  };

  const createNew = () => {
    setActiveBusinessId(null);
    nav("/setup/business?new=1");
  };

  const onEdit = (id: string) => {
    setActiveBusinessId(id);
    nav("/settings/business-profile");
  };
  const onManageUsers = (id: string) => {
    setActiveBusinessId(id);
    nav("/settings/company-users");
  };
  const onSettings = (id: string) => {
    setActiveBusinessId(id);
    nav("/settings/sales-config");
  };

  const promptArchiveOrDelete = async (id: string, name: string) => {
    const { data, error } = await supabase.rpc("business_transaction_count", { _business_id: id } as any);
    if (error) { toast.error(error.message); return; }
    const txCount = Number(data ?? 0);
    setConfirmAction({ kind: txCount > 0 ? "archive" : "delete", id, name, txCount });
  };

  const doConfirm = async () => {
    if (!confirmAction) return;
    try {
      if (confirmAction.kind === "archive") {
        const { error } = await supabase.rpc("archive_business", { _business_id: confirmAction.id } as any);
        if (error) throw error;
        await logAudit({ business_id: confirmAction.id, action: "COMPANY_ARCHIVED", entity_type: "business", entity_id: confirmAction.id });
        toast.success(`Archived "${confirmAction.name}"`);
      } else {
        const { error } = await supabase.from("businesses").delete().eq("id", confirmAction.id);
        if (error) throw error;
        await logAudit({ business_id: confirmAction.id, action: "COMPANY_DELETED", entity_type: "business", entity_id: confirmAction.id });
        toast.success(`Deleted "${confirmAction.name}"`);
      }
      queryClient.invalidateQueries({ queryKey: ["company-list"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirmAction(null);
    }
  };

  const unarchive = async (id: string, name: string) => {
    try {
      const { error } = await supabase.rpc("unarchive_business", { _business_id: id } as any);
      if (error) throw error;
      toast.success(`Restored "${name}"`);
      queryClient.invalidateQueries({ queryKey: ["company-list"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background gradient-mesh p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">RD Pro</p>
            <h1 className="font-display text-3xl font-bold mt-1">Select Company</h1>
            <p className="text-sm text-muted-foreground mt-2">Choose a company to open or create a new one.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sign out</Button>
            <Button onClick={createNew}><Plus className="h-4 w-4 mr-2" />Create New Company</Button>
          </div>
        </header>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name, GST, type…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived(v => !v)}>
            <Archive className="h-4 w-4 mr-2" />{showArchived ? "Hide archived" : "Show archived"}
          </Button>
        </div>

        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading companies…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border bg-card p-12 text-center space-y-4">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-lg">{showArchived ? "No archived companies" : "No companies yet"}</h2>
              {!showArchived && <p className="text-sm text-muted-foreground mt-1">Create your first company to start using RD Pro.</p>}
            </div>
            {!showArchived && <Button onClick={createNew}><Plus className="h-4 w-4 mr-2" />Create New Company</Button>}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => {
              const b = r.businesses!;
              const archived = !!b.archived_at;
              const isOwner = r.role === "owner";
              return (
                <div
                  key={b.id}
                  className="text-left rounded-2xl border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all group relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={archived ? "outline" : b.setup_completed ? "default" : "secondary"}>
                        {archived ? "Archived" : b.setup_completed ? "Active" : "Setup pending"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {!archived && (
                            <>
                              <DropdownMenuItem onClick={() => openCompany(b.id, b.business_name)}>
                                <Building2 className="h-4 w-4 mr-2" />Open Company
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onEdit(b.id)}>
                                <Pencil className="h-4 w-4 mr-2" />Edit Company
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onManageUsers(b.id)}>
                                <Users className="h-4 w-4 mr-2" />Manage Users
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onSettings(b.id)}>
                                <Settings className="h-4 w-4 mr-2" />Company Settings
                              </DropdownMenuItem>
                              {isOwner && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => promptArchiveOrDelete(b.id, b.business_name)} className="text-destructive">
                                    <Archive className="h-4 w-4 mr-2" />Archive / Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                          {archived && isOwner && (
                            <DropdownMenuItem onClick={() => unarchive(b.id, b.business_name)}>
                              <ArchiveRestore className="h-4 w-4 mr-2" />Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={archived}
                    onClick={() => !archived && openCompany(b.id, b.business_name)}
                    className="block w-full text-left mt-3 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <h3 className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-1">{b.business_name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">{b.business_type ?? "—"}</p>
                    <dl className="mt-4 space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">GST</dt>
                        <dd className="font-mono truncate max-w-[60%]">{b.gst_number || "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">FY</dt>
                        <dd className="truncate max-w-[60%]">{currentFY(b.fy_start_month)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Role</dt>
                        <dd className="capitalize">{r.role}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Created</dt>
                        <dd>{new Date(b.created_at).toLocaleDateString()}</dd>
                      </div>
                    </dl>
                    {!archived && <div className="mt-4 pt-3 border-t text-xs text-primary font-medium">Open company →</div>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === "archive" ? "Archive company?" : "Delete company?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === "archive"
                ? `"${confirmAction?.name}" has ${confirmAction?.txCount} transactions. To preserve audit history, it will be archived (hidden from the active list, no data deleted). You can restore it later.`
                : `"${confirmAction?.name}" has no transactions and will be permanently deleted. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirm} className={confirmAction?.kind === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}>
              {confirmAction?.kind === "archive" ? <><Archive className="h-4 w-4 mr-2" />Archive</> : <><Trash2 className="h-4 w-4 mr-2" />Delete</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
