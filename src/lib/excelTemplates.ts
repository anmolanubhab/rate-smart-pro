import * as XLSX from "xlsx";

function autoWidth(rows: any[][]) {
  const widths: number[] = [];
  rows.forEach((r) => r.forEach((c, i) => {
    const len = String(c ?? "").length;
    widths[i] = Math.max(widths[i] || 10, Math.min(40, len + 2));
  }));
  return widths.map((w) => ({ wch: w }));
}

export function downloadOrderTemplate() {
  const headers = ["Part Number", "Product Name", "HSN", "GST %", "Quantity", "MRP", "Rate", "Discount %"];
  const samples = [
    ["TVS-001", "Brake Pad Set", "8708", 28, 2, 850, 850, 18],
    ["TVS-022", "Engine Oil 1L", "2710", 18, 5, 420, 420, 10],
    ["LUB-100", "Chain Lube", "3403", 18, 1, 220, 220, 5],
  ];
  const aoa = [headers, ...samples];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = autoWidth(aoa);

  const instructions = [
    ["Order Import — Instructions"],
    [""],
    ["Required columns: Part Number, Quantity"],
    ["Optional columns: Product Name, HSN, GST %, MRP, Rate, Discount %"],
    [""],
    ["Matching priority: Part Number → Product Name (case-insensitive)"],
    ["Duplicate part numbers will be merged (quantities summed) or kept separate (your choice)."],
    ["Quantity must be > 0. Rows with missing Part Number are skipped."],
  ];
  const wsI = XLSX.utils.aoa_to_sheet(instructions);
  wsI["!cols"] = [{ wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Items");
  XLSX.utils.book_append_sheet(wb, wsI, "Instructions");
  XLSX.writeFile(wb, "order-import-template.xlsx");
}

export function downloadStockTemplate() {
  const headers = ["Part Number", "Qty"];
  const samples = [
    ["M10805", 40],
    ["25P110", 65],
    ["TVS-001", 10],
  ];
  const aoa = [headers, ...samples];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = autoWidth(aoa);

  const instructions = [
    ["Stock Import — Instructions"],
    [""],
    ["Only TWO columns are required:"],
    ["  1) Part Number"],
    ["  2) Qty"],
    [""],
    ["Product name, rate, MRP etc. already exist in your catalog and don't need to be re-uploaded."],
    [""],
    ["Modes:"],
    ["  REPLACE — overwrites existing stock with the uploaded Qty."],
    ["  ADD — adds uploaded Qty to existing stock."],
    [""],
    ["Unknown part numbers will appear in the error report. Negative final stock is rejected."],
  ];
  const wsI = XLSX.utils.aoa_to_sheet(instructions);
  wsI["!cols"] = [{ wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock");
  XLSX.utils.book_append_sheet(wb, wsI, "Instructions");
  XLSX.writeFile(wb, "stock-import-template.xlsx");
}

export function downloadErrorReport(rows: any[], name = "import-errors.xlsx") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Errors");
  XLSX.writeFile(wb, name);
}

export function exportSheet(rows: any[], name: string, sheetName = "Sheet1") {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, name);
}
