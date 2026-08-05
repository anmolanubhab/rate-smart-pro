// Pricing & Promotion Engine — Phase 1D. The Assignments tab on
// PriceListEditor.tsx: who is currently pointed at this price list, plus
// single-party and bulk-by-party-group assignment. No engine changes —
// src/lib/pricing/basePriceResolver.ts already reads party_price_assignments
// (party-level over group-level, sorted by priority).

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Users, Trash2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchParties, type Party } from "@/lib/parties";
import {
  fetchAssignmentsForPriceList, savePartyAssignment, deletePartyAssignment,
  previewBulkAssignment, applyBulkAssignment,
  type PartyPriceAssignmentRow, type AssignmentPreviewRow,
} from "@/lib/pricing/partyPriceAssignment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DocumentEntitySearchField } from "@/components/documentEngine/DocumentEntitySearchField";

interface Props {
  priceListId: string;
  businessId: string;
  editable: boolean;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PriceListAssignmentsTab({ priceListId, businessId, editable }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: assignments, isLoading } = useQuery({
    queryKey: ["price-list-assignments", priceListId],
    queryFn: () => fetchAssignmentsForPriceList(priceListId),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["price-list-assignments", priceListId] });

  // ── Add Party Assignment ────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [partyQuery, setPartyQuery] = useState("");
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [effectiveTo, setEffectiveTo] = useState("");
  const [isSpecial, setIsSpecial] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!addOpen || !user?.id || allParties.length) return;
    fetchParties(user.id).then(setAllParties).catch(() => {});
  }, [addOpen, user?.id, allParties.length]);

  const partyResults = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q || selectedParty) return [];
    return allParties.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 12);
  }, [allParties, partyQuery, selectedParty]);

  const resetAddForm = () => {
    setPartyQuery(""); setSelectedParty(null); setEffectiveFrom(todayIso()); setEffectiveTo(""); setIsSpecial(false); setRemarks("");
  };

  const addAssignment = async () => {
    if (!selectedParty) { toast.error("Search and select a party"); return; }
    setSaving(true);
    try {
      await savePartyAssignment({
        businessId, partyId: selectedParty.id, priceListId,
        effectiveFrom, effectiveTo: effectiveTo || null,
        priority: isSpecial ? 1 : 100,
        remarks: remarks || null,
      });
      toast.success(`${selectedParty.name} assigned`);
      setAddOpen(false);
      resetAddForm();
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save assignment");
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (row: PartyPriceAssignmentRow) => {
    if (!row.party_id) return;
    try {
      await deletePartyAssignment(row.id, businessId, row.party_id);
      toast.success("Removed");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not remove");
    }
  };

  // ── Bulk Assign to Party Group ───────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [bulkFrom, setBulkFrom] = useState(todayIso());
  const [bulkTo, setBulkTo] = useState("");
  const [bulkPriority, setBulkPriority] = useState(100);
  const [bulkRemarks, setBulkRemarks] = useState("");
  const [preview, setPreview] = useState<AssignmentPreviewRow[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!bulkOpen || !businessId) return;
    supabase.from("party_groups").select("id, name").eq("business_id", businessId).order("name").then(({ data }) => setGroups((data as any[]) ?? []));
  }, [bulkOpen, businessId]);

  const resetBulk = () => {
    setSelectedGroupId(""); setBulkFrom(todayIso()); setBulkTo(""); setBulkPriority(100); setBulkRemarks(""); setPreview(null);
  };

  const runPreview = async () => {
    if (!selectedGroupId) { toast.error("Choose a party group"); return; }
    setPreviewing(true);
    try {
      const rows = await previewBulkAssignment("PARTY_GROUP", selectedGroupId, priceListId, businessId, {
        effectiveFrom: bulkFrom, effectiveTo: bulkTo || null, priority: bulkPriority, remarks: bulkRemarks || null,
      });
      setPreview(rows);
      if (rows.length === 0) toast.warning("No parties in this group yet");
    } catch (e: any) {
      toast.error(e.message ?? "Could not preview");
    } finally {
      setPreviewing(false);
    }
  };

  const confirmBulk = async () => {
    setApplying(true);
    try {
      const result = await applyBulkAssignment("PARTY_GROUP", selectedGroupId, priceListId, {
        effectiveFrom: bulkFrom, effectiveTo: bulkTo || null, priority: bulkPriority, remarks: bulkRemarks || null,
      }, businessId);
      toast.success(`${result.changed} assigned, ${result.alreadySame} already matched`);
      setBulkOpen(false);
      resetBulk();
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Bulk assignment failed");
    } finally {
      setApplying(false);
    }
  };

  const conflictCount = preview?.filter((p) => p.conflict).length ?? 0;

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <Users className="h-3.5 w-3.5 mr-1" /> Bulk Assign to Party Group
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Party Assignment
          </Button>
        </div>
      )}

      <div className="rounded-2xl bg-card border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Priority</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Effective To</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-sm py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && (assignments ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm py-8 text-muted-foreground">No parties assigned to this list yet.</TableCell></TableRow>
              )}
              {(assignments ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{a.party_id ? "Party" : "Party Group"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm flex items-center gap-1.5">
                    {a.priority <= 1 && <Star className="h-3 w-3 text-amber-500" />}
                    {a.party?.name ?? a.party_group?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{a.priority}</TableCell>
                  <TableCell className="text-xs">{a.effective_from}</TableCell>
                  <TableCell className="text-xs">{a.effective_to ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{a.remarks ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {editable && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeAssignment(a)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Party Assignment */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAddForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Party Assignment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5 relative">
              <Label>Party</Label>
              {selectedParty ? (
                <div className="flex items-center justify-between rounded-lg border p-2 text-sm">
                  {selectedParty.name}
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setSelectedParty(null); setPartyQuery(""); }}>Change</Button>
                </div>
              ) : (
                <DocumentEntitySearchField
                  results={partyResults}
                  getKey={(p) => p.id}
                  query={partyQuery}
                  onQueryChange={setPartyQuery}
                  onSelect={(p) => { setSelectedParty(p); setPartyQuery(p.name); }}
                  renderRow={(p) => <span>{p.name}</span>}
                  placeholder="Search party…"
                  inputClassName="h-9 text-sm"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Effective From</Label>
                <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Effective To</Label>
                <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="cursor-pointer">Mark as Special</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Outranks a regular assignment for the same party (priority 1 vs 100)</p>
              </div>
              <Switch checked={isSpecial} onCheckedChange={setIsSpecial} />
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={addAssignment} disabled={saving}>{saving ? "Saving…" : "Assign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Assign to Party Group */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { setBulkOpen(o); if (!o) resetBulk(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Assign to Party Group</DialogTitle>
            <DialogDescription>Preview affected parties before applying.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Party Group</Label>
              <Select value={selectedGroupId} onValueChange={(v) => { setSelectedGroupId(v); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder="Choose a party group" /></SelectTrigger>
                <SelectContent>
                  {groups.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No party groups found for this business</div>}
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Effective From</Label>
                <Input type="date" value={bulkFrom} onChange={(e) => { setBulkFrom(e.target.value); setPreview(null); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Effective To</Label>
                <Input type="date" value={bulkTo} onChange={(e) => { setBulkTo(e.target.value); setPreview(null); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Input type="number" value={bulkPriority} onChange={(e) => { setBulkPriority(Number(e.target.value) || 100); setPreview(null); }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Textarea value={bulkRemarks} onChange={(e) => setBulkRemarks(e.target.value)} rows={2} />
            </div>

            {!preview ? (
              <Button variant="outline" onClick={runPreview} disabled={previewing || !selectedGroupId}>
                {previewing ? "Loading…" : "Dry Run Preview"}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="rounded-lg border p-2"><p className="text-lg font-bold">{preview.length}</p><p className="text-[10px] text-muted-foreground">Affected</p></div>
                  <div className="rounded-lg border p-2"><p className="text-lg font-bold text-muted-foreground">{preview.filter((p) => p.alreadySame).length}</p><p className="text-[10px] text-muted-foreground">Already Same</p></div>
                  <div className="rounded-lg border p-2"><p className="text-lg font-bold text-emerald-600">{preview.filter((p) => p.willChange).length}</p><p className="text-[10px] text-muted-foreground">Will Change</p></div>
                  <div className="rounded-lg border p-2"><p className="text-lg font-bold text-destructive">{conflictCount}</p><p className="text-[10px] text-muted-foreground">Conflicts</p></div>
                </div>
                <div className="border rounded-lg max-h-56 overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="text-xs">Party</TableHead><TableHead className="text-xs">Current</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {preview.map((p) => (
                        <TableRow key={p.partyId}>
                          <TableCell className="text-xs">{p.partyName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.currentPriceListName ?? "—"}</TableCell>
                          <TableCell>
                            {p.conflict ? <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10 text-[10px]">Conflict</Badge>
                              : p.alreadySame ? <Badge variant="outline" className="text-[10px]">Already Same</Badge>
                              : <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-[10px]">Will Change</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={applying}>Cancel</Button>
            {preview && (
              <Button onClick={confirmBulk} disabled={applying || preview.length === 0}>
                {applying ? "Applying…" : `Confirm (${preview.filter((p) => p.willChange).length})`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
