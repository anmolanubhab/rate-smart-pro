// src/lib/drillDown/types.ts
//
// Generic drill-down breadcrumb frame shape shared by any future Tally-style
// report (Stock Summary today; Sales/Purchase Summary, Party Outstanding
// later). Deliberately minimal — level/entityType/entityId/label/parentId,
// plus the per-level offset/search a report needs to restore exactly where
// the user left off when they navigate Back. Not a generic drill-down
// *engine* (registry, renderer dispatch, etc.) — that would be speculative
// for a single consumer; each report still owns its own fetch-per-level
// logic and just pushes/pops frames of this shape.
export interface DrillFrame<TLevel extends string = string> {
  level: TLevel;
  /** Entity this frame drills into (category name, product id, ...); null at the root. */
  entityId: string | null;
  /** Human label for the breadcrumb trail. */
  label: string;
  /** Parent frame's entityId, for reconstructing the chain if ever needed outside the stack. */
  parentId: string | null;
  offset: number;
  search: string;
}
