import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, MoreVertical, Pencil, Trash2, Star, Search, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";
import WarehouseFormDialog, { type WarehouseRow } from "@/components/inventory/WarehouseFormDialog";

export default function Warehouses() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WarehouseRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("warehouses")
      .select("id, warehouse_name, address, is_default, status")
      .eq("business_id", businessId)
      .order("is_default", { ascending: false })
      .order("warehouse_name", { ascending: true });
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as unknown as WarehouseRow[]);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (w: WarehouseRow) => { setEditing(w); setDialogOpen(true); };

  const handleSetDefault = async (w: WarehouseRow) => {
    const { error } = await supabase.from("warehouses").update({ is_default: true } as any).eq("id", w.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${w.warehouse_name} set as default`);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("warehouses").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      // FK restriction: GRNs require a warehouse and reference it directly
      if (error.code === "23503") {
        toast.error("This warehouse has purchase orders or GRNs recorded against it and can't be deleted.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Warehouse deleted");
    setDeleteTarget(null);
    load();
  };

  const filtered = rows.filter((r) =>
    !search.trim() ||
    r.warehouse_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.address ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Inventory</p>
          <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Warehouse Management</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage warehouses and set a default location for stock operations.</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Warehouse</Button>
      </header>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search warehouses…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <WarehouseIcon className="h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">
                      {rows.length === 0 ? "No warehouses yet. Add your first one to start receiving stock." : "No warehouses match your search."}
                    </p>
                    {rows.length === 0 && (
                      <Button size="sm" className="mt-1" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Warehouse</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {w.warehouse_name}
                      {w.is_default && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{w.address || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={w.is_default ? "default" : "outline"}>{w.is_default ? "Default" : "Active"}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(w)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        {!w.is_default && (
                          <DropdownMenuItem onClick={() => handleSetDefault(w)}>
                            <Star className="h-4 w-4 mr-2" /> Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(w)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <WarehouseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        userId={user?.id ?? null}
        warehouse={editing}
        onSaved={() => load()}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.warehouse_name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. Warehouses that already have purchase orders or GRNs recorded against them can't be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
