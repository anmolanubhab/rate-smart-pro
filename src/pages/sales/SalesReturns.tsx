import { useEffect } from "react";
import ReturnsListPanel from "@/components/returns/ReturnsListPanel";

export default function SalesReturns() {
  useEffect(() => { document.title = "Sales Returns — RD Pro"; }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <ReturnsListPanel kind="sales" />
    </div>
  );
}
