import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Wand2, Truck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchPendingItems, generatePendingOrder } from "@/lib/orders";
import { fetchParties, Party } from "@/lib/parties";

interface PendingRow {
  id: string;
  part_number: string;
  description: string;
  qty: number;
  dispatched_qty: number;
  pending_qty: number;
  net_rate: number;
  orders: { id: string; order_number: string; order_date: string; party_id: string; party_name: string; status: string };
}

const PendingOrders = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedParty, setExpandedParty] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchPendingItems(user.id), fetchParties(user.id)])
      .then(([r, p]) => { setRows(r as any); setParties(p); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { document.title = "Pending Orders — Spare Parts OMS"; load(); /* eslint-disable-next-line */ }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (partyFilter !== "all" && r.orders.party_id !== partyFilter) return false;
      if (q && !r.part_number.toLowerCase().includes(q) && !(r.description || "").toLowerCase().includes(q) && !r.orders.order_number.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, partyFilter, search]);

  const partyGroups = useMemo(() => {
    const map = new Map<string, { partyId: string; partyName: string; items: PendingRow[]; orders: Map<string, PendingRow[]> }>();
    for (const r of filtered) {
      const pid = r.orders.party_id || "—";
      if (!map.has(pid)) map.set(pid, { partyId: pid, partyName: r.orders.party_name || "—", items: [], orders: new Map() });
      const g = map.get(pid)!;
      g.items.push(r);
      const oid = r.orders.id;
      if (!g.orders.has(oid)) g.orders.set(oid, []);
      g.orders.get(oid)!.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.partyName.localeCompare(b.partyName));
  }, [filtered]);

  const handleGenerate = async (partyId: string, partyName: string) => {
    if (!user) return;
    if (!confirm(`Generate a new order combining all pending items for ${partyName}?`)) return;
    try {
      setGenerating(partyId);
      const o = await generatePendingOrder(user.id, partyId);
      toast.success(`Order ${o.order_number} created from pending balance`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Orders</p>
          <h1 className="font-display text-3xl font-bold mt-1">Party-Wise Pending</h1>
          <p className="text-muted-foreground mt-1 text-sm">Real-time pending balance grouped by party. Generate fresh orders in one click.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search part / order #" className="w-56" />
          <Select value={partyFilter} onValueChange={setPartyFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All parties</SelectItem>
              {parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button asChild variant="outline"><Link to="/dispatch"><Truck className="h-4 w-4" />Dispatch</Link></Button>
        </div>
      </header>

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">Loading...</div>
      ) : partyGroups.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-display font-semibold">Nothing pending</h3>
          <p className="text-sm text-muted-foreground mt-1">All confirmed orders are fully dispatched.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {partyGroups.map((g) => {
            const totalQty = g.items.reduce((s, x) => s + Number(x.pending_qty), 0);
            const totalValue = g.items.reduce((s, x) => s + Number(x.pending_qty) * Number(x.net_rate), 0);
            const ordersCount = g.orders.size;
            const lastDate = g.items.map((x) => x.orders.order_date).sort().reverse()[0];
            const open = expandedParty === g.partyId;
            return (
              <div key={g.partyId} className="rounded-2xl border border-border bg-card overflow-hidden shadow-soft">
                <button onClick={() => setExpandedParty(open ? null : g.partyId)} className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-smooth">
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <div className="font-semibold">{g.partyName}</div>
                      <div className="text-xs text-muted-foreground">{ordersCount} pending order{ordersCount > 1 ? "s" : ""}</div>
                    </div>
                    <div><div className="text-xs text-muted-foreground">Pending Qty</div><div className="font-semibold tabular-nums">{totalQty.toFixed(2)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Pending Value</div><div className="font-semibold tabular-nums">₹{totalValue.toFixed(2)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Last Order</div><div className="font-medium tabular-nums">{lastDate}</div></div>
                    <div className="flex items-center justify-end">
                      <Button size="sm" disabled={generating === g.partyId} onClick={(e) => { e.stopPropagation(); handleGenerate(g.partyId, g.partyName); }} className="gradient-primary text-white border-0">
                        <Wand2 className="h-4 w-4" />{generating === g.partyId ? "Generating..." : "Generate Pending Order"}
                      </Button>
                    </div>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-border bg-muted/20 p-3 space-y-2">
                    {Array.from(g.orders.entries()).map(([oid, oItems]) => {
                      const o = oItems[0].orders;
                      const oPending = oItems.reduce((s, x) => s + Number(x.pending_qty), 0);
                      const oValue = oItems.reduce((s, x) => s + Number(x.pending_qty) * Number(x.net_rate), 0);
                      const oOpen = expandedOrder === oid;
                      return (
                        <div key={oid} className="rounded-xl border border-border bg-card">
                          <button onClick={() => setExpandedOrder(oOpen ? null : oid)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/30">
                            {oOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                              <div className="font-mono text-xs">{o.order_number}</div>
                              <div className="tabular-nums">{o.order_date}</div>
                              <div>{oItems.length} item{oItems.length > 1 ? "s" : ""}</div>
                              <div className="tabular-nums">{oPending.toFixed(2)} pending</div>
                              <div className="flex items-center justify-between">
                                <span className="tabular-nums font-semibold">₹{oValue.toFixed(2)}</span>
                                <Badge variant="outline" className="capitalize">{o.status}</Badge>
                              </div>
                            </div>
                          </button>
                          {oOpen && (
                            <div className="border-t border-border overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px]">
                                  <tr>
                                    <th className="text-left px-3 py-2">Part</th>
                                    <th className="text-left px-3 py-2">Description</th>
                                    <th className="text-right px-3 py-2">Ordered</th>
                                    <th className="text-right px-3 py-2">Dispatched</th>
                                    <th className="text-right px-3 py-2">Pending</th>
                                    <th className="text-right px-3 py-2">Rate</th>
                                    <th className="text-right px-3 py-2">Pending Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {oItems.map((it) => (
                                    <tr key={it.id} className="border-t border-border">
                                      <td className="px-3 py-1.5 font-mono">{it.part_number}</td>
                                      <td className="px-3 py-1.5">{it.description}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.qty).toFixed(2)}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">{Number(it.dispatched_qty).toFixed(2)}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-amber-600">{Number(it.pending_qty).toFixed(2)}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums">₹{Number(it.net_rate).toFixed(2)}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">₹{(Number(it.pending_qty) * Number(it.net_rate)).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PendingOrders;
