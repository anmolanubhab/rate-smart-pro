import jsPDF from "jspdf";
import { format } from "date-fns";

export type InvoicePayload = {
  partyName?: string | null;
  invoiceDate?: string | null; // ISO date (yyyy-mm-dd) or display
  invoiceNumber?: string | null;
  billAmount: number;
  billDiscount: number;
  requiredDiscount: number;
  billOnMrp: number;
  afterRd: number;
  rdAmount: number;
};

export const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return format(dt, "dd MMM yyyy");
};

export const buildWhatsAppMessage = (p: InvoicePayload) => {
  const lines: string[] = ["*Invoice Summary*", ""];
  if (p.invoiceNumber) lines.push(`Invoice No: ${p.invoiceNumber}`);
  if (p.partyName) lines.push(`Party: ${p.partyName}`);
  if (p.invoiceDate) lines.push(`Date: ${fmtDate(p.invoiceDate)}`);
  if (p.invoiceNumber || p.partyName || p.invoiceDate) lines.push("");
  lines.push(`Bill Amount: ₹${fmtINR(p.billAmount)}`);
  lines.push(`Bill Discount: ${p.billDiscount}%`);
  lines.push(`Required Discount: ${p.requiredDiscount}%`);
  lines.push(`Final Payable: ₹${fmtINR(p.afterRd)}`);
  const sign = p.rdAmount < 0 ? "-" : "+";
  lines.push(`RD Amount: ${sign}₹${fmtINR(Math.abs(p.rdAmount))}`);
  lines.push("");
  lines.push("— RD Calculator Pro");
  return lines.join("\n");
};

export const shareOnWhatsApp = (p: InvoicePayload) => {
  const url = `https://wa.me/?text=${encodeURIComponent(buildWhatsAppMessage(p))}`;
  window.open(url, "_blank", "noopener,noreferrer");
};

export const generateInvoicePdf = (p: InvoicePayload) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;

  // Header bar
  doc.setFillColor(99, 80, 240); // primary
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("RD Calculator Pro", M, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Rate Difference Invoice", M, 64);

  doc.setFontSize(10);
  const issued = `Issued: ${format(new Date(), "dd MMM yyyy")}`;
  doc.text(issued, W - M - doc.getTextWidth(issued), 42);

  // Reset
  doc.setTextColor(20, 20, 30);

  let y = 130;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Invoice Details", M, y);
  y += 8;
  doc.setDrawColor(220, 220, 230);
  doc.line(M, y, W - M, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const detailRow = (label: string, value: string) => {
    doc.setTextColor(110, 110, 130);
    doc.text(label, M, y);
    doc.setTextColor(20, 20, 30);
    doc.setFont("helvetica", "bold");
    doc.text(value, M + 160, y);
    doc.setFont("helvetica", "normal");
    y += 20;
  };

  if (p.invoiceNumber) detailRow("Invoice Number:", p.invoiceNumber);
  if (p.partyName) detailRow("Party Name:", p.partyName);
  if (p.invoiceDate) detailRow("Invoice Date:", fmtDate(p.invoiceDate));
  if (!p.invoiceNumber && !p.partyName && !p.invoiceDate) {
    doc.setTextColor(140, 140, 150);
    doc.text("(No invoice metadata provided)", M, y);
    y += 20;
  }

  // Calculation breakdown
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 30);
  doc.text("Calculation Breakdown", M, y);
  y += 8;
  doc.line(M, y, W - M, y);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const row = (label: string, value: string, opts?: { bold?: boolean; color?: [number, number, number] }) => {
    doc.setTextColor(110, 110, 130);
    doc.text(label, M, y);
    if (opts?.color) doc.setTextColor(...opts.color);
    else doc.setTextColor(20, 20, 30);
    if (opts?.bold) doc.setFont("helvetica", "bold");
    const v = value;
    doc.text(v, W - M - doc.getTextWidth(v), y);
    doc.setFont("helvetica", "normal");
    y += 22;
  };

  row("Bill Amount", `Rs. ${fmtINR(p.billAmount)}`);
  row("Bill Discount", `${p.billDiscount}%`);
  row("Bill on MRP", `Rs. ${fmtINR(p.billOnMrp)}`);
  row("Required Discount", `${p.requiredDiscount}%`);

  y += 6;
  doc.setDrawColor(220, 220, 230);
  doc.line(M, y, W - M, y);
  y += 24;

  // Final payable highlighted
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(M, y - 18, W - M * 2, 44, 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 80, 50);
  doc.text("Final Payable (After RD)", M + 16, y + 8);
  const fp = `Rs. ${fmtINR(p.afterRd)}`;
  doc.setFontSize(16);
  doc.text(fp, W - M - 16 - doc.getTextWidth(fp), y + 10);
  y += 50;

  const negative = p.rdAmount < 0;
  const rdLabel = negative ? "Shortfall" : "RD Surplus";
  const rdColor: [number, number, number] = negative ? [200, 40, 50] : [180, 130, 20];
  row(rdLabel, `${negative ? "-" : "+"}Rs. ${fmtINR(Math.abs(p.rdAmount))}`, { bold: true, color: rdColor });

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor(230, 230, 235);
  doc.line(M, footerY - 12, W - M, footerY - 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(140, 140, 150);
  doc.text("Generated by RD Calculator Pro", M, footerY);
  const pg = "Thank you for your business";
  doc.text(pg, W - M - doc.getTextWidth(pg), footerY);

  const fileName = `invoice-${p.invoiceNumber || format(new Date(), "yyyyMMdd-HHmm")}.pdf`;
  doc.save(fileName);
};
