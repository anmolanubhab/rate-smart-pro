import { useEffect } from "react";
import MockTablePage from "@/components/accounts/MockTablePage";

const rows = [
  { time: "2026-06-01 14:22", user: "admin@rdpro.in", action: "ORDER_UPDATE", entity: "ORD-20260601-0014", result: "Success", result_tone: "success" },
  { time: "2026-06-01 13:48", user: "billing@rdpro.in", action: "DISPATCH_CREATE", entity: "DSP-20260601-0007", result: "Success", result_tone: "success" },
  { time: "2026-06-01 12:10", user: "billing@rdpro.in", action: "STOCK_IMPORT", entity: "stock-update.xlsx", result: "Partial (1007/5282)", result_tone: "warning" },
  { time: "2026-06-01 10:35", user: "admin@rdpro.in", action: "PARTY_DELETE", entity: "Verma Trading", result: "Blocked", result_tone: "danger" },
  { time: "2026-05-31 18:02", user: "admin@rdpro.in", action: "LOGIN", entity: "—", result: "Success", result_tone: "success" },
];

export default function AuditLogs() {
  useEffect(() => { document.title = "Audit Logs — RD Pro"; }, []);
  return (
    <MockTablePage
      eyebrow="Administration"
      title="Audit Logs"
      description="Immutable trail of user actions across the application. Mock data."
      kpis={[
        { label: "Events Today", value: rows.filter(r => r.time.startsWith("2026-06-01")).length },
        { label: "Successful", value: rows.filter(r => r.result === "Success").length, tone: "success" },
        { label: "Warnings", value: rows.filter(r => r.result_tone === "warning").length, tone: "warning" },
        { label: "Blocked", value: rows.filter(r => r.result_tone === "danger").length, tone: "danger" },
      ]}
      columns={[
        { key: "time", label: "Timestamp" },
        { key: "user", label: "User" },
        { key: "action", label: "Action" },
        { key: "entity", label: "Entity" },
        { key: "result", label: "Result", format: "badge" },
      ]}
      rows={rows}
    />
  );
}
