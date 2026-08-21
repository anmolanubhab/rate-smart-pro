import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Lock, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import AccountGroupFormDialog, { NATURE_LABEL } from "@/components/accounts/AccountGroupFormDialog";
import MoveLedgersDialog from "@/components/accounts/MoveLedgersDialog";
import { fetchAccountGroupTree, deleteAccountGroup, type AccountGroupNode } from "@/lib/accounting";

export default function AccountGroups() {
  useEffect(() => { document.title = "Account Groups — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const qc = useQueryClient();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["account-groups", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAccountGroupTree(business!.id),
  });

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountGroupNode | null>(null);
  const [initialParentId, setInitialParentId] = useState<string | null>(null);

  // Delete-with-ledgers remediation flow
  const [moveTarget, setMoveTarget] = useState<{ group: AccountGroupNode; ledgerIds: string[] } | null>(null);

  const byParent = useMemo(() => {
    const map = new Map<string | null, AccountGroupNode[]>();
    for (const g of groups) {
      const key = g.parent_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    for (const list of map.values()) list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name));
    return map;
  }, [groups]);

  const openCreate = (parentId: string | null) => {
    setEditing(null);
    setInitialParentId(parentId);
    setDialogOpen(true);
  };

  const openEdit = (g: AccountGroupNode) => {
    setEditing(g);
    setDialogOpen(true);
  };

  const handleDelete = async (g: AccountGroupNode) => {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    try {
      await deleteAccountGroup(g.id);
      toast.success(`Group "${g.name}" deleted`);
      qc.invalidateQueries({ queryKey: ["account-groups"] });
    } catch (e: any) {
      const msg: string = e.message ?? "Could not delete group";
      if (/ledger\(s\)/.test(msg)) {
        const { data } = await supabase.from("ledger_accounts").select("id").eq("group_id", g.id);
        setMoveTarget({ group: g, ledgerIds: (data ?? []).map((r: any) => r.id) });
      } else {
        toast.error(msg);
      }
    }
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const renderNode = (g: AccountGroupNode, depth: number): JSX.Element => {
    const children = byParent.get(g.id) ?? [];
    const isCollapsed = collapsed.has(g.id);
    return (
      <div key={g.id}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 border-b border-border/50 hover:bg-muted/30 group"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <button
            type="button"
            className="shrink-0 text-muted-foreground"
            onClick={() => children.length > 0 && toggle(g.id)}
          >
            {children.length > 0 ? (isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <span className="inline-block w-3.5" />}
          </button>
          <span className="text-sm font-medium flex-1 truncate">{g.name}</span>
          {g.is_system && <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="System group" />}
          {g.nature && <Badge variant="outline" className="text-[10px] font-normal shrink-0">{NATURE_LABEL[g.nature] ?? g.nature}</Badge>}
          {g.allow_ledger_creation === false && <Badge variant="secondary" className="text-[10px] font-normal shrink-0">No direct ledgers</Badge>}
          <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openCreate(g.id)} title="Add sub-group">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(g)} title="Edit" disabled={g.is_system}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(g)} title="Delete" disabled={g.is_system}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
        {!isCollapsed && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const roots = byParent.get(null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Accounts · Masters</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Account Groups</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            {isLoading ? "Loading…" : "Group hierarchy that every ledger, Balance Sheet, and P&L is built from."}
          </p>
        </div>
        <Button onClick={() => openCreate(null)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Group
        </Button>
      </header>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {roots.length === 0 && !isLoading ? (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">No groups yet</div>
        ) : (
          roots.map((g) => renderNode(g, 0))
        )}
      </div>

      {business?.id && user?.id && (
        <AccountGroupFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          groups={groups}
          businessId={business.id}
          userId={user.id}
          editing={editing}
          initialParentId={initialParentId}
          onSaved={() => qc.invalidateQueries({ queryKey: ["account-groups"] })}
        />
      )}

      <MoveLedgersDialog
        target={moveTarget}
        onClose={() => setMoveTarget(null)}
        groups={groups}
        onDone={() => {
          setMoveTarget(null);
          qc.invalidateQueries({ queryKey: ["account-groups"] });
          qc.invalidateQueries({ queryKey: ["ledgers"] });
        }}
      />
    </div>
  );
}
