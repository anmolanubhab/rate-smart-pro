import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Users, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import PartyExcelUpload from "@/components/PartyExcelUpload";
import { fetchParties, Party, DiscountType } from "@/lib/parties";

const emptyForm = {
  name: "",
  address: "",
  default_discount: "0",
  discount_type: "RD" as DiscountType,
  agreed_discount: "0",
  phone: "",
  gst: "",
  billing_address: "",
  shipping_address: "",
  beat: "",
  credit_limit: "0",
  outstanding_balance: "0",
  notes: "",
};

const Parties = () => {
  const { user } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Parties — RD Calculator Pro";
    if (user) load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const p = await fetchParties(user.id);
      setParties(p);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = async (p: Party) => {
    setEditing(p);
    setForm({
      name: p.name,
      address: p.address || "",
      default_discount: String(p.default_discount),
      discount_type: "RD",
      agreed_discount: String(p.agreed_discount),
      phone: p.phone || "",
      gst: p.gst || "",
      billing_address: p.billing_address || "",
      shipping_address: p.shipping_address || "",
      beat: p.beat || "",
      credit_limit: String(p.credit_limit ?? 0),
      outstanding_balance: String(p.outstanding_balance ?? 0),
      notes: p.notes || "",
    });
    setOpen(true);
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
        discount_type: "RD" as const,
        agreed_discount: parseFloat(form.agreed_discount) || 0,
        phone: form.phone.trim() || null,
        gst: form.gst.trim() || null,
        billing_address: form.billing_address.trim() || null,
        shipping_address: form.shipping_address.trim() || null,
        beat: form.beat.trim() || null,
        credit_limit: parseFloat(form.credit_limit) || 0,
        outstanding_balance: parseFloat(form.outstanding_balance) || 0,
        notes: form.notes.trim() || null,
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
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Business</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">Parties</h1>
          <p className="text-muted-foreground mt-1">Manage customers and discounts.</p>
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
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import Excel
          </Button>
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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Name</th>
                  <th className="text-left py-3 px-4 font-semibold hidden md:table-cell">Address</th>
                  <th className="text-left py-3 px-4 font-semibold">Default %</th>
                  <th className="text-left py-3 px-4 font-semibold">Agreed %</th>
                  <th className="text-left py-3 px-4 font-semibold hidden lg:table-cell">Type</th>
                  <th className="text-right py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-medium">
                      {p.name}
                      <div className="block md:hidden text-xs text-muted-foreground mt-1">
                        {p.address ? `${p.address.substring(0, 40)}${p.address.length > 40 ? "…" : ""}` : "—"}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">
                      {p.address ? p.address : "—"}
                    </td>
                    <td className="py-3 px-4 tabular-nums font-medium">
                      {p.default_discount}%
                    </td>
                    <td className="py-3 px-4 tabular-nums font-medium">
                      {p.agreed_discount}%
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
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
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(p)} className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 ..." />
              </div>
              <div className="space-y-1.5">
                <Label>GST Number</Label>
                <Input value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} placeholder="29ABCDE1234F1Z5" />
              </div>
              <div className="space-y-1.5">
                <Label>Beat / Area</Label>
                <Input value={form.beat} onChange={(e) => setForm({ ...form, beat: e.target.value })} placeholder="e.g. Market Road" />
              </div>
              <div className="space-y-1.5">
                <Label>Credit Limit (₹)</Label>
                <Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Outstanding Balance (₹)</Label>
                <Input type="number" value={form.outstanding_balance} onChange={(e) => setForm({ ...form, outstanding_balance: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Short Address (legacy)</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Optional" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Billing Address</Label>
                <Textarea value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Shipping Address</Label>
                <Textarea value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} rows={2} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Internal notes..." />
            </div>

            <div className="space-y-1.5">
              <Label>Agreed Discount (%)</Label>
              <Input
                type="number"
                value={form.agreed_discount}
                onChange={(e) => setForm({ ...form, agreed_discount: e.target.value })}
                placeholder="e.g. 24"
              />
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

      {user && (
        <PartyExcelUpload
          open={importOpen}
          onOpenChange={setImportOpen}
          userId={user.id}
          onImported={load}
        />
      )}
    </div>
  );
};

export default Parties;
