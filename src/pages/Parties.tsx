import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Users, Tag, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { fetchParties, fetchSegments, fetchPartyDiscounts, Party, Segment, PartyDiscount, DiscountType } from "@/lib/parties";

const emptyForm = {
  name: "",
  address: "",
  default_discount: "0",
  discount_type: "RD" as DiscountType,
  agreed_discount: "0",
};

const Parties = () => {
  const { user } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [segDiscounts, setSegDiscounts] = useState<Record<string, string>>({});
  const [newSegmentName, setNewSegmentName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Parties — RD Calculator Pro";
    if (user) load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [p, s] = await Promise.all([fetchParties(user.id), fetchSegments()]);
      setParties(p);
      setSegments(s);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setSegDiscounts({});
    setOpen(true);
  };

  const openEdit = async (p: Party) => {
    setEditing(p);
    setForm({
      name: p.name,
      address: p.address || "",
      default_discount: String(p.default_discount),
      discount_type: p.discount_type,
      agreed_discount: String(p.agreed_discount),
    });
    const pd = await fetchPartyDiscounts(p.id);
    const map: Record<string, string> = {};
    pd.forEach((d) => (map[d.segment_id] = String(d.discount)));
    setSegDiscounts(map);
    setOpen(true);
  };

  const handleAddSegment = async () => {
    if (!user || !newSegmentName.trim()) return;
    const { data, error } = await supabase
      .from("segments")
      .insert({ name: newSegmentName.trim(), user_id: user.id, is_default: false })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setSegments((prev) => [...prev, data as Segment]);
    setNewSegmentName("");
    toast.success("Segment added");
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim()) return toast.error("Party name is required");
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        address: form.address.trim() || null,
        default_discount: parseFloat(form.default_discount) || 0,
        discount_type: form.discount_type,
        agreed_discount: parseFloat(form.agreed_discount) || 0,
      };

      let partyId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("parties").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("parties").insert(payload).select().single();
        if (error) throw error;
        partyId = data.id;
      }

      // Upsert segment discounts
      if (partyId) {
        // Delete existing, then insert fresh (simple & reliable)
        await supabase.from("party_discounts").delete().eq("party_id", partyId);
        const rows = Object.entries(segDiscounts)
          .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
          .map(([segment_id, v]) => ({
            user_id: user.id,
            party_id: partyId!,
            segment_id,
            discount: parseFloat(v),
          }));
        if (rows.length) {
          const { error } = await supabase.from("party_discounts").insert(rows);
          if (error) throw error;
        }
      }

      toast.success(editing ? "Party updated" : "Party added");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Party) => {
    if (!confirm(`Delete party "${p.name}"?`)) return;
    const { error } = await supabase.from("parties").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Party deleted");
    load();
  };

  const filtered = parties.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.address || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Business</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Parties</h1>
          <p className="text-muted-foreground mt-1">Manage customers, discount rules, and segment-wise pricing.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search parties..."
              className="pl-9 w-full md:w-64"
            />
          </div>
          <Button onClick={openNew} className="gradient-primary text-white border-0 hover:opacity-90 shadow-elegant">
            <Plus className="h-4 w-4" /> Add Party
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-display font-semibold">No parties yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Add your first party to use discount automation in the calculator.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl p-5 bg-card border border-border shadow-soft hover:shadow-elegant transition-smooth hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold truncate">{p.name}</h3>
                  {p.address && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.address}</p>}
                </div>
                <Badge
                  variant="outline"
                  className={
                    p.discount_type === "RD"
                      ? "border-primary/30 text-primary bg-primary/5"
                      : "border-accent/30 text-accent bg-accent/5"
                  }
                >
                  {p.discount_type}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Default</p>
                  <p className="font-semibold tabular-nums">{p.default_discount}%</p>
                </div>
                {p.discount_type === "RD" && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Agreed</p>
                    <p className="font-semibold tabular-nums">{p.agreed_discount}%</p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(p)} className="flex-1">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(p)} className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? "Edit Party" : "Add New Party"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Party Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ram Traders" />
              </div>
              <div className="space-y-1.5">
                <Label>Default Discount (%)</Label>
                <Input
                  type="number"
                  value={form.default_discount}
                  onChange={(e) => setForm({ ...form, default_discount: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Optional"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Discount Type</Label>
              <RadioGroup
                value={form.discount_type}
                onValueChange={(v) => setForm({ ...form, discount_type: v as DiscountType })}
                className="grid grid-cols-2 gap-3"
              >
                <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-smooth">
                  <RadioGroupItem value="RD" />
                  <div>
                    <p className="font-semibold text-sm">RD — Rate Difference</p>
                    <p className="text-xs text-muted-foreground">Agreed vs bill discount</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-smooth">
                  <RadioGroupItem value="CD" />
                  <div>
                    <p className="font-semibold text-sm">CD — Cash Discount</p>
                    <p className="text-xs text-muted-foreground">Extra % on top</p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {form.discount_type === "RD" && (
              <div className="space-y-1.5">
                <Label>Agreed Discount (%)</Label>
                <Input
                  type="number"
                  value={form.agreed_discount}
                  onChange={(e) => setForm({ ...form, agreed_discount: e.target.value })}
                  placeholder="e.g. 24"
                />
                <p className="text-xs text-muted-foreground">Used as the Required Discount in the calculator.</p>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <Label className="m-0">Segment-wise Discounts</Label>
              </div>
              <p className="text-xs text-muted-foreground">Leave empty to fall back to the party's default/agreed discount.</p>
              <div className="space-y-2">
                {segments.map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm">
                      {s.name}
                      {s.is_default && <span className="text-xs text-muted-foreground ml-2">(default)</span>}
                    </span>
                    <Input
                      type="number"
                      placeholder="—"
                      value={segDiscounts[s.id] || ""}
                      onChange={(e) => setSegDiscounts({ ...segDiscounts, [s.id]: e.target.value })}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground w-4">%</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Input
                  value={newSegmentName}
                  onChange={(e) => setNewSegmentName(e.target.value)}
                  placeholder="Add custom segment..."
                />
                <Button type="button" variant="outline" onClick={handleAddSegment} disabled={!newSegmentName.trim()}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-primary text-white border-0 hover:opacity-90">
              {saving ? "Saving..." : editing ? "Update Party" : "Create Party"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Parties;
