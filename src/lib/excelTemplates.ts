import * as XLSX from "xlsx";

function autoWidth(rows: any[][]) {
  const widths: number[] = [];

  rows.forEach((r) =>
    r.forEach((c, i) => {
      const len = String(c ?? "").length;
      widths[i] = Math.max(widths[i] || 10, Math.min(40, len + 2));
    })
  );

  return widths.map((w) => ({ wch: w }));
}

/* =========================================================
   ORDER IMPORT TEMPLATE
   ONLY:
   1. Part Number
   2. Quantity
========================================================= */

export function downloadOrderTemplate() {
  const headers = ["Part Number", "Quantity"];

  const samples = [
    ["TVS-001", 2],
    ["TVS-022", 5],
    ["LUB-100", 1],
  ];

  const aoa = [headers, ...samples];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws["!cols"] = autoWidth(aoa);

  const instructions = [
    ["Order Import — Instructions"],
    [""],

    ["ONLY TWO columns are required:"],
    ["1) Part Number"],
    ["2) Quantity"],

    [""],

    ["Product Name, HSN, GST, Rate, MRP etc. are automatically fetched from the catalog/database."],

    [""],

    ["Matching Rules:"],
    ["- Matching is based ONLY on Part Number"],
    ["- Matching is case-insensitive"],
    ["- Spaces, dashes and formatting differences are ignored"],

    [""],

    ["Examples:"],
    ["ABC-101 = abc101 = ABC 101"],

    [""],

    ["Validation Rules:"],
    ["- Quantity must be greater than 0"],
    ["- Rows with missing Part Number are skipped"],
    ["- Unknown Part Numbers appear in error report"],
    ["- Duplicate part numbers are auto-merged"],

    [""],

    ["System Automatically Fetches:"],
    ["- Product Name"],
    ["- Description"],
    ["- HSN"],
    ["- GST"],
    ["- Rate"],
    ["- Stock"],
  ];

  const wsI = XLSX.utils.aoa_to_sheet(instructions);

  wsI["!cols"] = [{ wch: 100 }];

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Items");
  XLSX.utils.book_append_sheet(wb, wsI, "Instructions");

  XLSX.writeFile(wb, "NEW-TEMPLATE.xlsx");
}

/* =========================================================
   STOCK IMPORT TEMPLATE
========================================================= */

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

    ["ONLY TWO columns are required:"],
    ["1) Part Number"],
    ["2) Qty"],

    [""],

    ["Product details already exist in catalog/database."],

    [""],

    ["Modes:"],
    ["REPLACE → overwrite existing stock"],
    ["ADD → add uploaded quantity to existing stock"],

    [""],

    ["Validation Rules:"],
    ["- Unknown part numbers appear in error report"],
    ["- Negative final stock is rejected"],
    ["- Duplicate rows are auto-merged"],
  ];

  const wsI = XLSX.utils.aoa_to_sheet(instructions);

  wsI["!cols"] = [{ wch: 100 }];

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Stock");
  XLSX.utils.book_append_sheet(wb, wsI, "Instructions");

  XLSX.writeFile(wb, "stock-import-template.xlsx");
}

/* =========================================================
   ERROR REPORT
========================================================= */

export function downloadErrorReport(
  rows: any[],
  name = "import-errors.xlsx"
) {
  const ws = XLSX.utils.json_to_sheet(rows);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Errors");

  XLSX.writeFile(wb, name);
}

/* =========================================================
   GENERIC EXPORT
========================================================= */

export function exportSheet(
  rows: any[],
  name: string,
  sheetName = "Sheet1"
) {
  const ws = XLSX.utils.json_to_sheet(rows);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  XLSX.writeFile(wb, name);
}
