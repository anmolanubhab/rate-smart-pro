import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Lock, ChevronRight, ChevronDown, Search, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import AccountGroupFormDialog, { NATURE_LABEL } from "@/components/accounts/AccountGroupFormDialog";
import MoveLedgersDialog from "@/components/accounts/MoveLedgersDialog";
import ReassignLedgersDialog from "@/components/accounts/ReassignLedgersDialog";
import QuickCreateLedgerDialog from "@/components/vouchers/QuickCreateLedgerDialog";
import {
  fetchAccountGroupTree, fetchLedgersWithBalance, deleteAccountGroup, fmtInr,
  type AccountGroupNode, type LedgerRow,
} from "@/lib/accounting";

export default function ChartOfAccounts() {
  useEffect(() => { document.title = "Chart of Accounts — RD Pro"; }, []);
  const { user } = useAuth();
  const { business } = useBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["account-groups", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAccountGroupTree(business!.id),
  });
  const { data: ledgers = [], isLoading: ledgersLoading } = useQuery({
    queryKey: ["ledgers", user?.id, business?.id],
    enabled: !!user?.id,
    queryFn: () => fetchLedgersWithBalance(user!.id),
  });
  const isLoading = groupsLoading || ledgersLoading;

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AccountGroupNode | null>(null);
  const [initialParentId, setInitialParentId] = useState<string | null>(null);

  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false);
  const [editingLedger, setEditingLedger] = useState<LedgerRow | null>(null);
  const [ledgerPresetGroup, setLedgerPresetGroup] = useState<string | null>(null);

  const [moveTarget, setMoveTarget] = useState<{ group: AccountGroupNode; ledgerIds: string[] } | null>(null);
  const [reassignLedger, setReassignLedger] = useState<LedgerRow | null>(null);

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

  const ledgersByGroup = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const l of ledgers) {
      if (!l.group_id) continue;
      if (!map.has(l.group_id)) map.set(l.group_id, []);
      map.get(l.group_id)!.push(l);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [ledgers]);

  // When searching, a group/ledger matches if its own name matches; a group
  // also "matches" (stays visible) if any descendant group or ledger does --
  // this keeps the path to a hit visible instead of hiding it inside a
  // collapsed/filtered-out ancestor.
  const matchesSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const groupHit = new Set<string>();
    const ledgerHit = new Set<string>();
    for (const l of ledgers) {
      if (l.name.toLowerCase().includes(q)) ledgerHit.add(l.id);
    }
    for (const g of groups) {
      if (g.name.toLowerCase().includes(q)) groupHit.add(g.id);
    }
    // Propagate a hit upward through ancestor groups.
    const byId = new Map(groups.map((g) => [g.id, g]));
    const markAncestors = (groupId: string | null) => {
      let cur = groupId ? byId.get(groupId) : undefined;
      while (cur && !groupHit.has(cur.id)) {
        groupHit.add(cur.id);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
    };
    for (const l of ledgers) if (ledgerHit.has(l.id) && l.group_id) markAncestors(l.group_id);
    for (const g of groups) if (groupHit.has(g.id)) markAncestors(g.parent_id);
    return { groupHit, ledgerHit };
  }, [search, groups, ledgers]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openCreateGroup = (parentId: string | null) => {
    setEditingGroup(null);
    setInitialParentId(parentId);
    setGroupDialogOpen(true);
  };
  const openEditGroup = (g: AccountGroupNode) => {
    setEditingGroup(g);
    setGroupDialogOpen(true);
  };
  const openCreateLedger = (groupId: string | null) => {
    setEditingLedger(null);
    setLedgerPresetGroup(groupId);
    setLedgerDialogOpen(true);
  };

  const handleDeleteGroup = async (g: AccountGroupNode) => {
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

  const onLedgerClick = (l: LedgerRow) => {
    if (l.party_id) navigate(`/accounts/party/${l.party_id}`);
    else navigate(`/accounts/ledger/${l.id}`);
  };

  const renderLedgerRow = (l: LedgerRow, depth: number) => {
    if (matchesSearch && !matchesSearch.ledgerHit.has(l.id)) return null;
    const bal = l.balance ?? 0;
    return (
      <div
        key={l.id}
        className="flex items-center gap-2 py-1.5 px-2 border-b border-border/50 hover:bg-muted/30 group cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 28}px` }}
        onClick={() => onLedgerClick(l)}
      >
        <span className="text-sm flex-1 truncate text-muted-foreground">{l.name}</span>
        {l.is_system && <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="System ledger" />}
        <span className="text-sm tabular-nums w-28 text-right shrink-0">₹ {fmtInr(Math.abs(bal))} {bal < 0 ? "Cr" : "Dr"}</span>
        <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-6 w-6" title="Move to another group" onClick={() => setReassignLedger(l)}>
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-6 w-6" title="Edit" disabled={l.is_system}
            onClick={() => { setEditingLedger(l); setLedgerPresetGroup(null); setLedgerDialogOpen(true); }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
    );
  };

  const renderGroupNode = (g: AccountGroupNode, depth: number): JSX.Element | null => {
    const childGroups = byParent.get(g.id) ?? [];
    const childLedgers = ledgersByGroup.get(g.id) ?? [];
    if (matchesSearch && !matchesSearch.groupHit.has(g.id)) return null;
    const isCollapsed = !matchesSearch && collapsed.has(g.id);
    const hasChildren = childGroups.length > 0 || childLedgers.length > 0;
    return (
      <div key={g.id}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 border-b border-border/50 hover:bg-muted/30 group bg-muted/10"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <button type="button" className="shrink-0 text-muted-foreground" onClick={() => hasChildren && toggle(g.id)}>
            {hasChildren ? (isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <span className="inline-block w-3.5" />}
          </button>
          <span className="text-sm font-semibold flex-1 truncate">{g.name}</span>
          {g.is_system && <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="System group" />}
          {g.nature && <Badge variant="outline" className="text-[10px] font-normal shrink-0">{NATURE_LABEL[g.nature] ?? g.nature}</Badge>}
          <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
            {g.allow_ledger_creation !== false && (
              <Button size="icon" variant="ghost" className="h-6 w-6" title="Add ledger here" onClick={() => openCreateLedger(g.id)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-6 w-6" title="Add sub-group" onClick={() => openCreateGroup(g.id)}>
              <Plus className="h-3.5 w-3.5 opacity-50" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit group" disabled={g.is_system} onClick={() => openEditGroup(g)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="Delete group" disabled={g.is_system} onClick={() => handleDeleteGroup(g)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>
        {!isCollapsed && (
          <>
            {childGroups.map((c) => renderGroupNode(c, depth + 1))}
            {childLedgers.map((l) => renderLedgerRow(l, depth + 1))}
          </>
        )}
      </div>
    );
  };

  const roots = byParent.get(null) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Accounts · Masters</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Chart of Accounts</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            {isLoading ? "Loading…" : "Every group and ledger in one tree — create, edit, move, or open any report."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openCreateGroup(null)}><Plus className="h-4 w-4 mr-1.5" /> New Group</Button>
          <Button onClick={() => openCreateLedger(null)}><Plus className="h-4 w-4 mr-1.5" /> New Ledger</Button>
        </div>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search groups or ledgers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {roots.length === 0 && !isLoading ? (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">No groups yet</div>
        ) : (
          roots.map((g) => renderGroupNode(g, 0))
        )}
      </div>

      {business?.id && user?.id && (
        <>
          <AccountGroupFormDialog
            open={groupDialogOpen}
            onOpenChange={setGroupDialogOpen}
            groups={groups}
            businessId={business.id}
            userId={user.id}
            editing={editingGroup}
            initialParentId={initialParentId}
            onSaved={() => qc.invalidateQueries({ queryKey: ["account-groups"] })}
          />
          <QuickCreateLedgerDialog
            open={ledgerDialogOpen}
            onOpenChange={setLedgerDialogOpen}
            businessId={business.id}
            userId={user.id}
            ledger={editingLedger}
            presetGroupId={ledgerPresetGroup}
            onCreated={() => qc.invalidateQueries({ queryKey: ["ledgers"] })}
          />
        </>
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

      <ReassignLedgersDialog
        ledgerIds={reassignLedger ? [reassignLedger.id] : []}
        label={reassignLedger ? `"${reassignLedger.name}"` : ""}
        onClose={() => setReassignLedger(null)}
        groups={groups}
        onDone={() => {
          setReassignLedger(null);
          qc.invalidateQueries({ queryKey: ["ledgers"] });
        }}
      />
    </div>
  );
}
