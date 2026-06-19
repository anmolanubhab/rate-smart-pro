/**
 * Debug logger for RD Pro — only emits in development mode.
 */
export function rdproDebug(label: string, data?: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[rdpro] ${label}`, data ?? "");
  }
}
