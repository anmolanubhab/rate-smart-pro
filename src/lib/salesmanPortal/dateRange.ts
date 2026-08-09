export type SalesDatePreset = "today" | "yesterday" | "week" | "month" | "fy" | "custom";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function fyStart(): string {
  const now = new Date();
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyYear}-04-01`;
}

export function salesDateRangeForPreset(preset: SalesDatePreset, customFrom?: string, customTo?: string): { from: string; to: string } {
  const today = new Date();
  if (preset === "today") return { from: iso(today), to: iso(today) };
  if (preset === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: iso(y), to: iso(y) };
  }
  if (preset === "week") {
    const start = new Date(today); start.setDate(start.getDate() - start.getDay());
    return { from: iso(start), to: iso(today) };
  }
  if (preset === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(start), to: iso(today) };
  }
  if (preset === "fy") return { from: fyStart(), to: iso(today) };
  return { from: customFrom || iso(today), to: customTo || iso(today) };
}
