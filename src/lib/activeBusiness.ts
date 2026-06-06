// Single source of truth for the active company id used in Supabase queries.
// Stored in localStorage by setActiveBusinessId / CompanySelection.
const KEY = "rdpro.activeBusinessId";

export function getActiveBusinessIdSync(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Subscribe to active-business changes (event fires from useBusiness.setActiveBusinessId). */
export function onActiveBusinessChange(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("rdpro:active-business-changed", handler);
  return () => window.removeEventListener("rdpro:active-business-changed", handler);
}
