import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface WarehouseRow {
  id: string;
  warehouse_name: string;
  address: string | null;
  is_default: boolean;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string | null;
  userId: string | null;
  /** Pass an existing warehouse to edit it; omit to create a new one. */
  warehouse?: WarehouseRow | null;
  /** Called with the saved row so the caller can refresh its list / auto-select it. */
  onSaved: (warehouse: WarehouseRow) => void;
}

export default function WarehouseFormDialog({ open, onOpenChange, businessId, userId, warehouse, onSaved }: Props) {
  const isEdit = !!warehouse;
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(warehouse?.warehouse_name ?? "");
    setAddress(warehouse?.address ?? "");
    setIsDefault(warehouse?.is_default ?? false);
  }, [open, warehouse]);

  const handleSave = async () => {
    if (!businessId) {
      toast.error("Select a business first");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Warehouse name is required");
      return;
    }

    try {
      setSaving(true);

      if (isEdit && warehouse) {
        const { data, error } = await supabase
          .from("warehouses")
          .update({
            warehouse_name: trimmedName,
            address: address.trim() || null,
            is_default: isDefault,
          } as any)
          .eq("id", warehouse.id)
          .select()
          .single();
        if (error) throw error;
        toast.success("Warehouse updated");
        onSaved(data as unknown as WarehouseRow);
      } else {
        const { data, error } = await supabase
          .from("warehouses")
          .insert([{
            business_id: businessId,
            warehouse_name: trimmedName,
            address: address.trim() || null,
            is_default: isDefault,
            created_by: userId ?? null,
          }] as any)
          .select()
          .single();
        if (error) throw error;
        toast.success("Warehouse created");
        onSaved(data as unknown as WarehouseRow);
      }

      onOpenChange(false);
    } catch (e: any) {
      if (e?.code === "23505") {
        toast.error("A warehouse with this name already exists");
      } else {
        toast.error(e?.message ?? "Failed to save warehouse");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Warehouse Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Warehouse, Bangalore Depot"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Address</Label>
            <Textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional address / location details"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Set as default warehouse</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Pre-selected automatically on new GRNs and Purchase Orders</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Warehouse"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
