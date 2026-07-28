import { useEffect } from "react";
import ReturnsListPanel from "@/components/returns/ReturnsListPanel";

export default function PurchaseReturns() {
  useEffect(() => { document.title = "Purchase Returns — RD Pro"; }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <ReturnsListPanel kind="purchase" />
    </div>
  );
}
