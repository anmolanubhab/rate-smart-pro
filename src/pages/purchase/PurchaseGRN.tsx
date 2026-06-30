import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { getActiveBusinessIdSync } from "@/lib/activeBusiness";

interface GRNItem {
  purchase_order_item_id: string | null;
  product_id: string;
  product_name: string;
  part_number: string;
  ordered_qty: number;
  received_qty: number;
  damaged_qty: number;
  accepted_qty: number;
  pending_qty: number;
}

export default function PurchaseGRN() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { business } = useBusiness();
  const businessId = business?.id ?? getActiveBusinessIdSync();

  const [grnNumber, setGrnNumber] = useState('');
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState('');

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);

  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedPO, setSelectedPO] = useState('');

  const [items, setItems] = useState<GRNItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch suppliers (parties), warehouses, and POs eligible for receipt
  useEffect(() => {
    if (!businessId) return;
    const fetchMasterData = async () => {
      try {
        const [{ data: partyData }, { data: warehouseData }, { data: poData }] = await Promise.all([
          supabase.from('parties').select('id, name').eq('business_id', businessId).order('name'),
          supabase.from('warehouses').select('id, name, is_default').eq('business_id', businessId).order('is_default', { ascending: false }),
          supabase.from('purchase_orders').select('id, po_number, supplier_id, warehouse_id')
            .eq('business_id', businessId)
            .in('status', ['approved', 'ordered', 'partially_received'])
            .order('created_at', { ascending: false }),
        ]);
        if (partyData) setSuppliers(partyData);
        if (warehouseData) {
          setWarehouses(warehouseData);
          const def = warehouseData.find((w: any) => w.is_default);
          if (def) setSelectedWarehouse(def.id);
        }
        if (poData) setPurchaseOrders(poData);

        const { data: grnNo } = await supabase.rpc('next_grn_number', { _business_id: businessId } as any);
        setGrnNumber((grnNo as string) || `GRN-${Date.now().toString().slice(-6)}`);
      } catch (err: any) {
        console.error("Error loading master data:", err.message);
      }
    };
    fetchMasterData();
  }, [businessId]);

  // When a Purchase Order is selected, auto-fill details and fetch items
  const handlePOChange = async (poId: string) => {
    setSelectedPO(poId);
    setLoading(true);

    const { data: poDetails } = await supabase
      .from('purchase_orders')
      .select('supplier_id, warehouse_id')
      .eq('id', poId)
      .single();

    if (poDetails) {
      if (poDetails.supplier_id) setSelectedSupplier(poDetails.supplier_id);
      if (poDetails.warehouse_id) setSelectedWarehouse(poDetails.warehouse_id);
    }

    // Already-received quantities against this PO (for partial GRN support)
    const { data: priorReceipts } = await supabase
      .from('goods_receipt_items')
      .select('product_id, accepted_qty, goods_receipts!inner(purchase_order_id, status)')
      .eq('goods_receipts.purchase_order_id', poId)
      .eq('goods_receipts.status', 'received');

    const receivedMap = new Map<string, number>();
    (priorReceipts ?? []).forEach((r: any) => {
      receivedMap.set(r.product_id, (receivedMap.get(r.product_id) ?? 0) + Number(r.accepted_qty ?? 0));
    });

    const { data: poItems, error } = await supabase
      .from('purchase_order_items')
      .select(`
        id, product_id, qty,
        product:products(name, part_number)
      `)
      .eq('purchase_order_id', poId);

    if (error) {
      toast({ title: "Error fetching PO items", description: error.message, variant: "destructive" });
    } else if (poItems) {
      const mappedItems: GRNItem[] = poItems
        .map((item: any) => {
          const ordered = Number(item.qty);
          const alreadyReceived = receivedMap.get(item.product_id) ?? 0;
          const remaining = Math.max(0, ordered - alreadyReceived);
          return {
            purchase_order_item_id: item.id,
            product_id: item.product_id,
            product_name: item.product?.name || 'Unknown Product',
            part_number: item.product?.part_number || 'N/A',
            ordered_qty: remaining,
            received_qty: remaining,
            damaged_qty: 0,
            accepted_qty: remaining,
            pending_qty: 0,
          };
        })
        .filter((it) => it.ordered_qty > 0);
      setItems(mappedItems);
      if (mappedItems.length === 0) {
        toast({ title: "Nothing pending", description: "All items on this PO have already been received." });
      }
    }
    setLoading(false);
  };

  const handleQtyChange = (index: number, field: 'received_qty' | 'damaged_qty', value: number) => {
    const updatedItems = [...items];
    const item = { ...updatedItems[index] };

    if (field === 'received_qty') item.received_qty = Math.max(0, value);
    if (field === 'damaged_qty') item.damaged_qty = Math.max(0, value);

    item.accepted_qty = Math.max(0, item.received_qty - item.damaged_qty);
    item.pending_qty = Math.max(0, item.ordered_qty - item.received_qty);

    updatedItems[index] = item;
    setItems(updatedItems);
  };

  const handleSaveGRN = async (status: 'draft' | 'received' | 'closed') => {
    if (!businessId) {
      toast({ title: "No active company", description: "Select a business first.", variant: "destructive" });
      return;
    }
    if (!selectedSupplier || !selectedWarehouse) {
      toast({ title: "Validation Error", description: "Supplier and Warehouse are required.", variant: "destructive" });
      return;
    }
    if (status === 'received' && items.length === 0) {
      toast({ title: "No items", description: "Select a Purchase Order with pending items first.", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);

      const { data: grn, error: grnError } = await supabase
        .from('goods_receipts')
        .insert([{
          business_id: businessId,
          grn_number: grnNumber,
          purchase_order_id: selectedPO || null,
          supplier_id: selectedSupplier,
          warehouse_id: selectedWarehouse,
          grn_date: grnDate,
          status,
          remarks,
          created_by: user?.id ?? null,
        }])
        .select()
        .single();

      if (grnError) throw grnError;

      if (items.length > 0) {
        const grnItemsPayload = items.map(item => ({
          goods_receipt_id: grn.id,
          purchase_order_item_id: item.purchase_order_item_id,
          product_id: item.product_id,
          ordered_qty: item.ordered_qty,
          received_qty: item.received_qty,
          damaged_qty: item.damaged_qty,
          accepted_qty: item.accepted_qty,
          pending_qty: item.pending_qty,
        }));

        const { error: itemsError } = await supabase
          .from('goods_receipt_items')
          .insert(grnItemsPayload);

        if (itemsError) throw itemsError;
      }

      toast({ title: "Success", description: `GRN created as ${status.toUpperCase()}` });
      navigate('/purchase');

    } catch (error: any) {
      toast({ title: "Operation Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Goods Receipt Note (GRN)</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GRN Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>GRN Number</Label>
            <Input value={grnNumber} onChange={(e) => setGrnNumber(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>GRN Date</Label>
            <Input type="date" value={grnDate} onChange={(e) => setGrnDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Link Purchase Order</Label>
            <Select value={selectedPO} onValueChange={handlePOChange}>
              <SelectTrigger><SelectValue placeholder="Select approved PO" /></SelectTrigger>
              <SelectContent>
                {purchaseOrders.map((po) => <SelectItem key={po.id} value={po.id}>{po.po_number}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
              <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Warehouse</Label>
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger><SelectValue placeholder="Select Warehouse" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-3">
            <Label>Remarks</Label>
            <Textarea placeholder="Add description..." value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items Matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b bg-muted/60">
                <th className="p-3">Product</th>
                <th className="p-3">Part Number</th>
                <th className="p-3 text-center">Ordered</th>
                <th className="p-3 text-center">Received</th>
                <th className="p-3 text-center">Damaged</th>
                <th className="p-3 text-center">Accepted</th>
                <th className="p-3 text-center">Pending</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">Please select an approved Purchase Order above to process items.</td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/10">
                    <td className="p-3 font-medium">{item.product_name}</td>
                    <td className="p-3 text-muted-foreground">{item.part_number}</td>
                    <td className="p-3 text-center font-semibold">{item.ordered_qty}</td>
                    <td className="p-3">
                      <Input type="number" className="w-24 mx-auto text-center" value={item.received_qty} onChange={(e) => handleQtyChange(idx, 'received_qty', Number(e.target.value))} />
                    </td>
                    <td className="p-3">
                      <Input type="number" className="w-24 mx-auto text-center text-red-500 font-medium" value={item.damaged_qty} onChange={(e) => handleQtyChange(idx, 'damaged_qty', Number(e.target.value))} />
                    </td>
                    <td className="p-3 text-center text-green-600 font-bold">{item.accepted_qty}</td>
                    <td className="p-3 text-center text-orange-500 font-bold">{item.pending_qty}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
        <Button variant="outline" className="gap-2" onClick={() => handleSaveGRN('draft')} disabled={loading}>
          <Save className="h-4 w-4" /> Save Draft
        </Button>
        <Button variant="secondary" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleSaveGRN('received')} disabled={loading}>
          <CheckCircle className="h-4 w-4" /> Receive Stock
        </Button>
        <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleSaveGRN('closed')} disabled={loading}>
          <XCircle className="h-4 w-4" /> Close GRN
        </Button>
      </div>
    </div>
  );
}
