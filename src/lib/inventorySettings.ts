// src/lib/inventorySettings.ts
//
// Business-wide Inventory Settings (Settings → Configuration → Inventory):
// toggles that decide whether bin/warehouse/tracking UI shows up across GRN,
// Dispatch, Stock Transfer, Stock Take, Picking List, etc. Same
// one-row-per-business accounting_settings row every other business-wide
// toggle already lives on (permission_mode, require_hsn_on_invoice,
// enable_einvoice, ...) -- not a new table.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";

export interface InventorySettings {
  enableMultiWarehouse: boolean;
  enableBinManagement: boolean;
  enableZoneRackBinHierarchy: boolean;
  enableBatchTracking: boolean;
  enableSerialTracking: boolean;
  enableQualityInspection: boolean;
  enablePutawayWorkflow: boolean;
  enableCycleCounting: boolean;
}

// Everything with live, working UI today defaults to enabled so a missing
// row/column never hides a screen that was already visible.
// enableQualityInspection defaults false -- that feature doesn't exist yet
// (Issue #37), so defaulting it on would be a no-op promise.
const DEFAULT_SETTINGS: InventorySettings = {
  enableMultiWarehouse: true,
  enableBinManagement: true,
  enableZoneRackBinHierarchy: true,
  enableBatchTracking: true,
  enableSerialTracking: true,
  enableQualityInspection: false,
  enablePutawayWorkflow: true,
  enableCycleCounting: true,
};

// Mirrors the isMissingTable guard in accountingLock.ts / permissionMode.ts --
// accounting_settings (or these columns specifically) can lag behind the
// latest migration on some environments, so a missing table/column degrades
// to the defaults rather than throwing.
function isMissingTable(error: any) {
  return error && (error.code === "PGRST205" || /Could not find the table|column/i.test(error.message ?? ""));
}

const COLUMNS =
  "enable_multi_warehouse, enable_bin_management, enable_zone_rack_bin_hierarchy, enable_batch_tracking, enable_serial_tracking, enable_quality_inspection, enable_putaway_workflow, enable_cycle_counting";

export async function fetchInventorySettings(businessId: string): Promise<InventorySettings> {
  const { data, error } = await supabase
    .from("accounting_settings" as any)
    .select(COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return DEFAULT_SETTINGS;
    throw error;
  }
  if (!data) return DEFAULT_SETTINGS;
  const row = data as any;
  return {
    enableMultiWarehouse: row.enable_multi_warehouse ?? DEFAULT_SETTINGS.enableMultiWarehouse,
    enableBinManagement: row.enable_bin_management ?? DEFAULT_SETTINGS.enableBinManagement,
    enableZoneRackBinHierarchy: row.enable_zone_rack_bin_hierarchy ?? DEFAULT_SETTINGS.enableZoneRackBinHierarchy,
    enableBatchTracking: row.enable_batch_tracking ?? DEFAULT_SETTINGS.enableBatchTracking,
    enableSerialTracking: row.enable_serial_tracking ?? DEFAULT_SETTINGS.enableSerialTracking,
    enableQualityInspection: row.enable_quality_inspection ?? DEFAULT_SETTINGS.enableQualityInspection,
    enablePutawayWorkflow: row.enable_putaway_workflow ?? DEFAULT_SETTINGS.enablePutawayWorkflow,
    enableCycleCounting: row.enable_cycle_counting ?? DEFAULT_SETTINGS.enableCycleCounting,
  };
}

export async function setInventorySettings(businessId: string, patch: Partial<InventorySettings>): Promise<void> {
  const row: Record<string, boolean> = {};
  if (patch.enableMultiWarehouse !== undefined) row.enable_multi_warehouse = patch.enableMultiWarehouse;
  if (patch.enableBinManagement !== undefined) row.enable_bin_management = patch.enableBinManagement;
  if (patch.enableZoneRackBinHierarchy !== undefined) row.enable_zone_rack_bin_hierarchy = patch.enableZoneRackBinHierarchy;
  if (patch.enableBatchTracking !== undefined) row.enable_batch_tracking = patch.enableBatchTracking;
  if (patch.enableSerialTracking !== undefined) row.enable_serial_tracking = patch.enableSerialTracking;
  if (patch.enableQualityInspection !== undefined) row.enable_quality_inspection = patch.enableQualityInspection;
  if (patch.enablePutawayWorkflow !== undefined) row.enable_putaway_workflow = patch.enablePutawayWorkflow;
  if (patch.enableCycleCounting !== undefined) row.enable_cycle_counting = patch.enableCycleCounting;

  const { error } = await supabase.from("accounting_settings" as any).upsert({
    business_id: businessId,
    ...row,
  });
  if (error) throw error;
}

/** The active business's inventory settings -- cached, defaults to all-enabled (except Quality Inspection) until loaded/unset. */
export function useInventorySettings(): InventorySettings {
  const { business } = useBusiness();
  const { data } = useQuery({
    queryKey: ["inventory-settings", business?.id],
    enabled: !!business?.id,
    queryFn: () => fetchInventorySettings(business!.id),
    staleTime: 60 * 1000,
  });
  return data ?? DEFAULT_SETTINGS;
}
