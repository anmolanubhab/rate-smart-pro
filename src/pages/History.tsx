import { useEffect, useMemo, useState } from "react";
import { Trash2, Download, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Calc = {
  id: string;
  bill_amount: number;
  bill_discount: number;
  required_discount: number;
  bill_on_mrp: number;
  after_rd: number;
  rd_amount: number;
  created_at: string;
};

const fmt = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));

const History = () => {
  const { user } = useAuth();
  const [calcs, setCalcs] = useState<Calc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    document.title = "History — RD Calculator Pro";
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("calculations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setCalcs((data as Calc[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const filtered = useMemo(() => {
    if (!q) return calcs;
    const needle = q.toLowerCase();
    return calcs.filter((c) =>
      [c.bill_amount, c.bill_discount, c.required_discount, c.after_rd, c.rd_amount]
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [calcs, q]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("calculations").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      setCalcs((prev) => prev.filter((c) => c.id !== id));
      toast.success("Deleted");
    }
  };

  const exportCsv = () => {
    if (filtered.length === 0) { toast.error("Nothing to export"); return; }
    const rows = [
      ["Date", "Bill Amount", "Bill Discount %", "Required Discount %", "Bill on MRP", "After RD", "RD Amount"],
      ...filtered.map((c) => [
        new Date(c.created_at).toISOString(),
        c.bill_amount, c.bill_discount, c.required_discount, c.bill_on_mrp, c.after_rd, c.rd_amount,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rd-calculations-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">History</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Saved calculations</h1>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
        </div>
      </header>

      <div className="rounded-2xl bg-card border border-border shadow-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Bill Amount</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Required</TableHead>
              <TableHead className="text-right">After RD</TableHead>
              <TableHead className="text-right">RD Amount</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No calculations found</TableCell></TableRow>
            ) : filtered.map((c) => {
              const neg = Number(c.rd_amount) < 0;
              return (
                <TableRow key={c.id} className="transition-smooth">
                  <TableCell className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">₹{fmt(c.bill_amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.bill_discount}%</TableCell>
                  <TableCell className="text-right tabular-nums">{c.required_discount}%</TableCell>
                  <TableCell className="text-right tabular-nums">₹{fmt(c.after_rd)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-semibold", neg ? "text-destructive" : "text-success")}>
                    {neg ? "-" : "+"}₹{fmt(Math.abs(Number(c.rd_amount)))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default History;
