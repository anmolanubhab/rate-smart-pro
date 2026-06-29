import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness, can } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { logAudit } from "@/lib/audit";

const TYPES = ["sales","purchase","receipt","payment","journal","contra","credit_note","debit_note"] as const;
type VType = typeof TYPES[number];

type Series = {
  id: string;
  voucher_type: VType;
  series_name: string;
  prefix: string;
  suffix: string;
  padding: number;
  next_number: number;
  fy_start_month: number;
  reset_yearly: boolean;
  mode: string;
  branch: string | null;
  is_default: boolean;
};

const blank = (t: VType): Omit<Series, "id"> => ({
  voucher_type: t,
  series_name: "Default",
  prefix: t.slice(0,3).toUpperCase() + "/",
  suffix: "",
  padding: 4,
  next_number: 1,
  fy_start_month: 4,
  reset_yearly: true,
  mode: "auto",
  branch: null,
  is_default: true,
});

export default function VoucherNumbering() {
  const { user } = useAuth();
  const { business, role } = useBusiness();
  const qc = useQueryClient();
  const editable = can(role, "settings.edit");
  const [type, setType] = useState<VType>("sales");

  useEffect(() => { document.title = "Voucher Numbering — RD Pro"; }, []);

  const list = useQuery({
    queryKey: ["voucher-series", user?.id, business?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_number_series").select("*")
        .order("voucher_type").order("created_at");
      if (error) throw error;
      return data as unknown as Series[];
    },
  });

  const create = async () => {
    if (!user) return;
    const { error } = await supabase.from("voucher_number_series").insert({
      ...blank(type),
      user_id: user.id,
      business_id: business?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: "SERIES_CREATE", entity_type: "voucher_number_series", new_value: { type } });
    toast.success("Series created");
    qc.invalidateQueries({ queryKey: ["voucher-series"] });
  };

  const update = async (id: string, patch: Partial<Series>) => {
    const { error } = await supabase.from("voucher_number_series").update(patch as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: "SERIES_UPDATE", entity_type: "voucher_number_series", entity_id: id, new_value: patch });
    qc.invalidateQueries({ queryKey: ["voucher-series"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this series?")) return;
    const { error } = await supabase.from("voucher_number_series").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ business_id: business?.id, action: "SERIES_DELETE", entity_type: "voucher_number_series", entity_id: id });
    qc.invalidateQueries({ queryKey: ["voucher-series"] });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <header>
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl font-bold mt-1">Voucher Numbering</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Numbers are reserved at <strong>save time</strong> — no number is consumed when a form opens, and cancelled numbers are never reused.
        </p>
      </header>

      {editable && (
        <section className="rounded-2xl bg-card border p-6 flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Voucher Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as VType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={create}>Add series</Button>
        </section>
      )}

      <section className="rounded-2xl bg-card border p-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Prefix</TableHead><TableHead>Padding</TableHead>
                <TableHead>Next #</TableHead><TableHead>FY Start</TableHead><TableHead>Reset Yearly</TableHead>
                <TableHead>Mode</TableHead><TableHead>Default</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map(s => (
                <TableRow key={s.id}>
                  <TableCell>{s.voucher_type}</TableCell>
                  <TableCell><Input disabled={!editable} className="h-8" defaultValue={s.series_name} onBlur={(e) => e.target.value !== s.series_name && update(s.id, { series_name: e.target.value })} /></TableCell>
                  <TableCell><Input disabled={!editable} className="h-8 w-28" defaultValue={s.prefix} onBlur={(e) => e.target.value !== s.prefix && update(s.id, { prefix: e.target.value })} /></TableCell>
                  <TableCell><Input disabled={!editable} type="number" className="h-8 w-16" defaultValue={s.padding} onBlur={(e) => Number(e.target.value) !== s.padding && update(s.id, { padding: Number(e.target.value) })} /></TableCell>
                  <TableCell><Input disabled={!editable} type="number" className="h-8 w-20" defaultValue={s.next_number} onBlur={(e) => Number(e.target.value) !== s.next_number && update(s.id, { next_number: Number(e.target.value) })} /></TableCell>
                  <TableCell><Input disabled={!editable} type="number" min={1} max={12} className="h-8 w-16" defaultValue={s.fy_start_month} onBlur={(e) => Number(e.target.value) !== s.fy_start_month && update(s.id, { fy_start_month: Number(e.target.value) })} /></TableCell>
                  <TableCell><Switch disabled={!editable} checked={s.reset_yearly} onCheckedChange={(v) => update(s.id, { reset_yearly: v })} /></TableCell>
                  <TableCell>
                    <Select disabled={!editable} value={s.mode} onValueChange={(v) => update(s.id, { mode: v })}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="auto">Auto</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Switch disabled={!editable} checked={s.is_default} onCheckedChange={(v) => update(s.id, { is_default: v })} /></TableCell>
                  <TableCell>{editable && <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>Delete</Button>}</TableCell>
                </TableRow>
              ))}
              {(list.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">No series configured. The system falls back to a daily prefix (e.g. SAL-20260603-0001) until you add one.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
