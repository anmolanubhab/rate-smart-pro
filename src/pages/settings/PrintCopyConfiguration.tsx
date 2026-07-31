import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useBusiness } from "@/hooks/useBusiness";
import { canGranular } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchAllPrintCopyTypes, createPrintCopyType, updatePrintCopyType, deletePrintCopyType,
} from "@/lib/printCopyTypes";

export default function PrintCopyConfiguration() {
  useEffect(() => { document.title = "Print Copy Configuration — RD Pro"; }, []);
  const { business, role, permissions } = useBusiness();
  const qc = useQueryClient();
  const editable = canGranular(role, "settings.edit", permissions);

  const list = useQuery({
    queryKey: ["print-copy-types", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchAllPrintCopyTypes(business!.id),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["print-copy-types", business?.id] });

  const [newLabel, setNewLabel] = useState("");
  const addType = async () => {
    if (!business?.id || !newLabel.trim()) return;
    try {
      await createPrintCopyType(business.id, newLabel.trim(), (list.data?.length ?? 0) + 1);
      setNewLabel("");
      refresh();
      toast.success("Copy type added");
    } catch (e: any) {
      toast.error(e.message ?? "Could not add copy type");
    }
  };

  const update = async (id: string, patch: Parameters<typeof updatePrintCopyType>[1]) => {
    try {
      await updatePrintCopyType(id, patch);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Could not update copy type");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this copy type?")) return;
    try {
      await deletePrintCopyType(id);
      refresh();
      toast.success("Copy type deleted");
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete copy type");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Print Copy Configuration</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Copy labels offered when printing any document (Sales Invoice, Purchase Invoice, Delivery Challan, and
          more as they're added). Disabled copy types are hidden from the print dialog but not deleted.
        </p>
      </header>

      {editable && (
        <section className="rounded-2xl bg-card border p-6 flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">New copy label</label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Quadruplicate for Accounts" />
          </div>
          <Button onClick={addType} disabled={!newLabel.trim()}>Add copy type</Button>
        </section>
      )}

      <section className="rounded-2xl bg-card border p-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Default (used for "Original Only")</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Input
                      disabled={!editable}
                      className="h-8"
                      defaultValue={c.label}
                      onBlur={(e) => e.target.value !== c.label && e.target.value.trim() && update(c.id, { label: e.target.value.trim() })}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch disabled={!editable} checked={c.enabled} onCheckedChange={(v) => update(c.id, { enabled: v })} />
                  </TableCell>
                  <TableCell>
                    <Switch disabled={!editable} checked={c.is_default} onCheckedChange={(v) => update(c.id, { is_default: v })} />
                  </TableCell>
                  <TableCell>
                    {editable && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!list.isLoading && (list.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No copy types yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
