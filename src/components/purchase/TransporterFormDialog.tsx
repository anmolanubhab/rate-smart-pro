import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createTransporter, type Transporter } from "@/lib/transporters";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  userId: string;
  onCreated: (transporter: Transporter) => void;
}

const emptyForm = { name: "", gstin: "", phone: "", email: "", address: "" };

export default function TransporterFormDialog({ open, onOpenChange, businessId, userId, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) setForm(emptyForm);
  }, [open]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Transporter name is required");
      return;
    }
    setSaving(true);
    try {
      const transporter = await createTransporter({
        businessId, userId,
        name: form.name, gstin: form.gstin, phone: form.phone, email: form.email, address: form.address,
      });
      toast.success("Transporter created");
      onCreated(transporter);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create transporter");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Transporter</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>GSTIN</Label>
              <Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & Select"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
