// Shared HSN-summary grouping logic for both the sales and purchase HSN
// Summary reports (src/pages/gst/HsnSummary.tsx and HsnSummaryPurchase.tsx).
// Same shape, same hsn_master enrichment step, different source tables —
// kept as one parameterized module instead of duplicating the file per the
// HSN Compliance Engine Phase 9 plan.

import { supabase } from "@/integrations/supabase/client";

export interface HsnSummaryRow {
  hsn: string;
  description: string | null;
  uqc: string | null;
  gst_pct: number;
  qty: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
}

interface GroupAcc {
  hsn: string;
  gst_pct: number;
  qty: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

async function attachHsnMasterInfo(groups: Map<string, GroupAcc>) {
  const codes = Array.from(new Set(Array.from(groups.values()).map((g) => g.hsn))).filter((h) => h !== "(HSN not set)");
  const infoByCode = new Map<string, { description: string | null; default_uqc: string | null }>();
  const chunk = 500;
  for (let i = 0; i < codes.length; i += chunk) {
    const slice = codes.slice(i, i + chunk);
    const { data, error } = await supabase.from("hsn_master" as any).select("hsn_code, description, default_uqc").in("hsn_code", slice);
    if (error) throw error;
    (data as { hsn_code: string; description: string | null; default_uqc: string | null }[] | null)?.forEach((d) =>
      infoByCode.set(d.hsn_code, { description: d.description, default_uqc: d.default_uqc })
    );
  }
  return infoByCode;
}

async function finalizeGroups(groups: Map<string, GroupAcc>): Promise<HsnSummaryRow[]> {
  const infoByCode = await attachHsnMasterInfo(groups);
  return Array.from(groups.values())
    .sort((a, b) => (a.hsn === "(HSN not set)" ? 1 : b.hsn === "(HSN not set)" ? -1 : a.hsn.localeCompare(b.hsn)))
    .map((g) => ({
      hsn: g.hsn,
      description: infoByCode.get(g.hsn)?.description ?? null,
      uqc: infoByCode.get(g.hsn)?.default_uqc ?? null,
      gst_pct: g.gst_pct,
      qty: Math.round(g.qty),
      taxable: Math.round(g.taxable),
      cgst: Math.round(g.cgst),
      sgst: Math.round(g.sgst),
      igst: Math.round(g.igst),
      tax: Math.round(g.cgst + g.sgst + g.igst),
    }));
}

export async function fetchSalesHsnSummary(businessId: string, from: string, to: string): Promise<HsnSummaryRow[]> {
  const { data: invoices, error: invErr } = await supabase
    .from("sales_invoices")
    .select("id")
    .eq("business_id", businessId)
    .eq("status", "posted")
    .gte("invoice_date", from)
    .lte("invoice_date", to);
  if (invErr) throw invErr;
  const invoiceIds = (invoices ?? []).map((i: any) => i.id);
  if (invoiceIds.length === 0) return [];

  const { data: items, error } = await supabase
    .from("sales_invoice_items")
    .select("hsn, gst_pct, qty, net_rate, total, product_id, cgst_amount, sgst_amount, igst_amount, products(hsn_code)")
    .in("invoice_id", invoiceIds);
  if (error) throw error;

  const groups = new Map<string, GroupAcc>();
  for (const it of (items as any[]) ?? []) {
    // Line-level HSN was never populated historically — fall back to the
    // product master's HSN so this report works with real data as soon as
    // products have HSN set, without needing every past invoice line backfilled.
    const hsn = it.hsn || it.products?.hsn_code || "(HSN not set)";
    const pct = Number(it.gst_pct) || 0;
    const key = `${hsn}__${pct}`;
    const taxable = it.net_rate != null ? Number(it.net_rate) * Number(it.qty) : Number(it.total) / (1 + pct / 100);
    const g = groups.get(key) ?? { hsn, gst_pct: pct, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.qty += Number(it.qty) || 0;
    g.taxable += taxable;
    g.cgst += Number(it.cgst_amount) || 0;
    g.sgst += Number(it.sgst_amount) || 0;
    g.igst += Number(it.igst_amount) || 0;
    groups.set(key, g);
  }
  return finalizeGroups(groups);
}

export async function fetchPurchaseHsnSummary(businessId: string, from: string, to: string): Promise<HsnSummaryRow[]> {
  // Purchase Invoice has no draft state (see purchaseInvoices.ts) — every
  // row except a cancelled one represents a real posted purchase.
  const { data: invoices, error: invErr } = await supabase
    .from("purchase_invoices")
    .select("id")
    .eq("business_id", businessId)
    .neq("status", "cancelled")
    .gte("invoice_date", from)
    .lte("invoice_date", to);
  if (invErr) throw invErr;
  const invoiceIds = (invoices ?? []).map((i: any) => i.id);
  if (invoiceIds.length === 0) return [];

  const { data: items, error } = await supabase
    .from("purchase_invoice_items")
    .select("hsn, gst_percent, quantity, purchase_price, line_total, product_id, cgst_amount, sgst_amount, igst_amount, products(hsn_code)")
    .in("purchase_invoice_id", invoiceIds);
  if (error) throw error;

  const groups = new Map<string, GroupAcc>();
  for (const it of (items as any[]) ?? []) {
    const hsn = it.hsn || it.products?.hsn_code || "(HSN not set)";
    const pct = Number(it.gst_percent) || 0;
    const key = `${hsn}__${pct}`;
    const taxable = it.purchase_price != null ? Number(it.purchase_price) * Number(it.quantity) : Number(it.line_total) / (1 + pct / 100);
    const g = groups.get(key) ?? { hsn, gst_pct: pct, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.qty += Number(it.quantity) || 0;
    g.taxable += taxable;
    g.cgst += Number(it.cgst_amount) || 0;
    g.sgst += Number(it.sgst_amount) || 0;
    g.igst += Number(it.igst_amount) || 0;
    groups.set(key, g);
  }
  return finalizeGroups(groups);
}
