// src/lib/inventoryReports.ts
// All Supabase RPC calls + helpers for Inventory Reports module
import { supabase } from "@/integrations/supabase/client";

const today = () => new Date().toISOString().slice(0, 10);

// ─── Stock Summary ────────────────────────────────────────────────────────────
export interface StockSummaryParams {
  businessId: string;
  fromDate?: string | null;
  toDate?: string;
  warehouseId?: string | null;
  brand?: string | null;
  category?: string | null;
  search?: string | null;
  stockFilter?: "all" | "positive" | "negative" | "zero";
  limit?: number;
  offset?: number;
}

export interface StockSummaryRow {
  product_id: string;
  product_name: string;
  part_number: string | null;
  brand: string | null;
  category: string | null;
  product_group: string | null;
  segment: string | null;
  unit: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  mrp: number;
  sale_rate: number;
  purchase_price: number;
  opening_qty: number;
  opening_value: number;
  inward_qty: number;
  inward_value: number;
  outward_qty: number;
  outward_value: number;
  closing_qty: number;
  closing_value: number;
  avg_rate: number;
  margin_pct: number;
  total_rows: number;
}

export async function fetchStockSummary(p: StockSummaryParams): Promise<StockSummaryRow[]> {
  const { data, error } = await supabase.rpc("get_stock_summary", {
    p_business_id:  p.businessId,
    p_from_date:    p.fromDate ?? null,
    p_to_date:      p.toDate ?? today(),
    p_warehouse_id: p.warehouseId ?? null,
    p_brand:        p.brand ?? null,
    p_category:     p.category ?? null,
    p_group_id:     null,
    p_segment_id:   null,
    p_search:       p.search ?? null,
    p_stock_filter: p.stockFilter ?? "all",
    p_limit:        p.limit ?? 500,
    p_offset:       p.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []) as StockSummaryRow[];
}

// ─── Movement Register ────────────────────────────────────────────────────────
export interface MovementRow {
  id: string;
  movement_date: string;
  product_id: string;
  product_name: string;
  part_number: string | null;
  movement_type: string;
  reference_type: string;
  reference_id: string;
  voucher_number: string | null;
  party_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  inward_qty: number;
  outward_qty: number;
  rate: number;
  value: number;
  stock_before: number;
  stock_after: number;
  notes: string | null;
  total_rows: number;
}

export async function fetchMovementRegister(
  businessId: string,
  fromDate?: string | null,
  toDate?: string,
  productId?: string | null,
  warehouseId?: string | null,
  movementType?: string | null,
  limit = 500,
  offset = 0,
): Promise<MovementRow[]> {
  const { data, error } = await supabase.rpc("get_stock_movement_register", {
    p_business_id:   businessId,
    p_from_date:     fromDate ?? null,
    p_to_date:       toDate ?? today(),
    p_product_id:    productId ?? null,
    p_warehouse_id:  warehouseId ?? null,
    p_movement_type: movementType ?? null,
    p_limit:         limit,
    p_offset:        offset,
  });
  if (error) throw error;
  return (data ?? []) as MovementRow[];
}

// ─── Group Summary ────────────────────────────────────────────────────────────
export interface GroupSummaryRow {
  group_id: string | null;
  group_name: string;
  product_count: number;
  opening_qty: number; opening_value: number;
  inward_qty: number;  inward_value: number;
  outward_qty: number; outward_value: number;
  closing_qty: number; closing_value: number;
}

export async function fetchStockGroupSummary(
  businessId: string, fromDate?: string | null, toDate?: string,
): Promise<GroupSummaryRow[]> {
  const { data, error } = await supabase.rpc("get_stock_group_summary", {
    p_business_id: businessId,
    p_from_date: fromDate ?? null,
    p_to_date: toDate ?? today(),
  });
  if (error) throw error;
  return (data ?? []) as GroupSummaryRow[];
}

// ─── Category Summary ─────────────────────────────────────────────────────────
export interface CategorySummaryRow {
  category: string;
  product_count: number;
  opening_qty: number; opening_value: number;
  inward_qty: number;  inward_value: number;
  outward_qty: number; outward_value: number;
  closing_qty: number; closing_value: number;
}

export async function fetchStockCategorySummary(
  businessId: string, fromDate?: string | null, toDate?: string,
): Promise<CategorySummaryRow[]> {
  const { data, error } = await supabase.rpc("get_stock_category_summary", {
    p_business_id: businessId,
    p_from_date: fromDate ?? null,
    p_to_date: toDate ?? today(),
  });
  if (error) throw error;
  return (data ?? []) as CategorySummaryRow[];
}

// ─── Warehouse Summary ────────────────────────────────────────────────────────
export interface WarehouseSummaryRow {
  warehouse_id: string | null;
  warehouse_name: string;
  product_count: number;
  opening_qty: number; opening_value: number;
  inward_qty: number;  inward_value: number;
  outward_qty: number; outward_value: number;
  closing_qty: number; closing_value: number;
}

export async function fetchWarehouseSummary(
  businessId: string, fromDate?: string | null, toDate?: string,
): Promise<WarehouseSummaryRow[]> {
  const { data, error } = await supabase.rpc("get_warehouse_stock_summary", {
    p_business_id: businessId,
    p_from_date: fromDate ?? null,
    p_to_date: toDate ?? today(),
  });
  if (error) throw error;
  return (data ?? []) as WarehouseSummaryRow[];
}

// ─── Stock Ageing ─────────────────────────────────────────────────────────────
export interface AgeingRow {
  product_id: string;
  product_name: string;
  part_number: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  closing_qty: number;
  closing_value: number;
  last_movement_date: string | null;
  days_since_movement: number;
  bucket_0_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_91_180: number;
  bucket_181_365: number;
  bucket_365_plus: number;
  ageing_bucket: string;
  total_rows: number;
}

export async function fetchStockAgeing(
  businessId: string, asOfDate?: string, warehouseId?: string | null,
  brand?: string | null, category?: string | null, limit = 500, offset = 0,
): Promise<AgeingRow[]> {
  const { data, error } = await supabase.rpc("get_stock_ageing", {
    p_business_id: businessId, p_as_of_date: asOfDate ?? today(),
    p_warehouse_id: warehouseId ?? null, p_brand: brand ?? null,
    p_category: category ?? null, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as AgeingRow[];
}

// ─── Dead Stock ───────────────────────────────────────────────────────────────
export interface DeadStockRow {
  product_id: string;
  product_name: string;
  part_number: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  closing_qty: number;
  closing_value: number;
  last_movement_date: string | null;
  days_idle: number;
  total_rows: number;
}

export async function fetchDeadStock(
  businessId: string, daysThreshold = 180, asOfDate?: string,
  warehouseId?: string | null, limit = 500, offset = 0,
): Promise<DeadStockRow[]> {
  const { data, error } = await supabase.rpc("get_dead_stock_report", {
    p_business_id: businessId, p_days_threshold: daysThreshold,
    p_as_of_date: asOfDate ?? today(), p_warehouse_id: warehouseId ?? null,
    p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as DeadStockRow[];
}

// ─── ABC Analysis ─────────────────────────────────────────────────────────────
export interface AbcRow {
  product_id: string;
  product_name: string;
  part_number: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  outward_qty: number;
  outward_value: number;
  cumulative_pct: number;
  abc_class: "A" | "B" | "C";
  rank: number;
}

export async function fetchAbcAnalysis(
  businessId: string, fromDate?: string | null, toDate?: string, by: "value" | "qty" = "value",
): Promise<AbcRow[]> {
  const { data, error } = await supabase.rpc("get_abc_analysis", {
    p_business_id: businessId, p_from_date: fromDate ?? null,
    p_to_date: toDate ?? today(), p_by: by,
  });
  if (error) throw error;
  return (data ?? []) as AbcRow[];
}

// ─── FSN Analysis ─────────────────────────────────────────────────────────────
export interface FsnRow {
  product_id: string;
  product_name: string;
  part_number: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  outward_qty: number;
  outward_value: number;
  movement_count: number;
  closing_qty: number;
  fsn_class: "F" | "S" | "N";
}

export async function fetchFsnAnalysis(
  businessId: string, fromDate?: string | null, toDate?: string,
  fastThreshold = 10, slowThreshold = 1,
): Promise<FsnRow[]> {
  const { data, error } = await supabase.rpc("get_fsn_analysis", {
    p_business_id: businessId, p_from_date: fromDate ?? null,
    p_to_date: toDate ?? today(), p_fast_threshold: fastThreshold,
    p_slow_threshold: slowThreshold,
  });
  if (error) throw error;
  return (data ?? []) as FsnRow[];
}

// ─── Stock Valuation ──────────────────────────────────────────────────────────
export interface ValuationRow {
  product_id: string;
  product_name: string;
  part_number: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  closing_qty: number;
  avg_cost: number;
  total_cost: number;
  mrp: number;
  sale_rate: number;
  mrp_value: number;
  sale_value: number;
  profit_potential: number;
  total_rows: number;
}

export async function fetchStockValuation(
  businessId: string, asOfDate?: string, warehouseId?: string | null,
  brand?: string | null, category?: string | null, limit = 500, offset = 0,
): Promise<ValuationRow[]> {
  const { data, error } = await supabase.rpc("get_stock_valuation", {
    p_business_id: businessId, p_as_of_date: asOfDate ?? today(),
    p_warehouse_id: warehouseId ?? null, p_brand: brand ?? null,
    p_category: category ?? null, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as ValuationRow[];
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export interface InventoryDashboardData {
  total_products: number;
  total_stock_value: number;
  total_mrp_value: number;
  positive_stock: number;
  zero_stock: number;
  negative_stock: number;
  low_stock: number;
  dead_stock: number;
  fast_moving: number;
  slow_moving: number;
  non_moving: number;
  top_brand: string | null;
  top_category: string | null;
}

export async function fetchInventoryDashboard(
  businessId: string, asOfDate?: string,
): Promise<InventoryDashboardData | null> {
  const { data, error } = await supabase.rpc("get_inventory_dashboard", {
    p_business_id: businessId,
    p_as_of_date: asOfDate ?? today(),
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

// ─── Drill Down ───────────────────────────────────────────────────────────────
export interface DrillDownRow {
  transaction_date: string;
  transaction_type: string;
  reference_type: string;
  reference_id: string;
  voucher_number: string | null;
  party_name: string;
  warehouse_name: string;
  inward_qty: number;
  outward_qty: number;
  rate: number;
  value: number;
  running_balance: number;
  notes: string;
}

export async function fetchStockDrillDown(
  businessId: string, productId: string,
  fromDate?: string | null, toDate?: string,
): Promise<DrillDownRow[]> {
  const { data, error } = await supabase.rpc("get_stock_drill_down", {
    p_business_id: businessId, p_product_id: productId,
    p_from_date: fromDate ?? null, p_to_date: toDate ?? today(),
  });
  if (error) throw error;
  return (data ?? []) as DrillDownRow[];
}

// ─── Filter helpers ───────────────────────────────────────────────────────────
export async function fetchDistinctBrands(businessId: string): Promise<string[]> {
  const { data } = await supabase
    .from("products")
    .select("brand")
    .eq("business_id", businessId)
    .not("brand", "is", null)
    .order("brand");
  return [...new Set((data ?? []).map((d: any) => d.brand).filter(Boolean))];
}

export async function fetchDistinctCategories(businessId: string): Promise<string[]> {
  const { data } = await supabase
    .from("products")
    .select("category")
    .eq("business_id", businessId)
    .not("category", "is", null)
    .order("category");
  return [...new Set((data ?? []).map((d: any) => d.category).filter(Boolean))];
}

export async function fetchWarehouses(businessId: string) {
  const { data } = await supabase
    .from("warehouses")
    .select("id, warehouse_name, is_default")
    .eq("business_id", businessId)
    .order("is_default", { ascending: false });
  return data ?? [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const fmtInr = (n: number | null | undefined) =>
  "₹ " + (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtQty = (n: number | null | undefined, d = 2) =>
  (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: d });

export const fyStart = () => {
  const now = new Date();
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyYear}-04-01`;
};

export const MOVEMENT_LABELS: Record<string, { label: string; color: string }> = {
  initial:       { label: "Opening Balance", color: "text-gray-500" },
  purchase_grn:  { label: "Purchase (GRN)",  color: "text-emerald-600" },
  purchase:      { label: "Purchase",        color: "text-emerald-600" },
  dispatch:      { label: "Sales Dispatch",  color: "text-rose-600" },
  sales_invoice: { label: "Sales Invoice",   color: "text-rose-600" },
  return:        { label: "Return",          color: "text-blue-600" },
  adjustment:    { label: "Adjustment",      color: "text-amber-600" },
  transfer_in:   { label: "Transfer In",     color: "text-indigo-600" },
  transfer_out:  { label: "Transfer Out",    color: "text-indigo-600" },
  import:        { label: "Stock Import",    color: "text-purple-600" },
};
export const getMovementLabel = (type: string) =>
  MOVEMENT_LABELS[type] ?? { label: type.replace(/_/g, " "), color: "text-gray-500" };
