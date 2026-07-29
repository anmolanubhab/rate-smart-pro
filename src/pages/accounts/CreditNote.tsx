// src/pages/accounts/CreditNote.tsx
// Route: /accounts/credit-note
//
// Two modes, one voucher type — per the approved design:
//   Financial Adjustment: no stock movement, generic Voucher Engine, optional invoice link.
//   Material Return: always from a Sales Invoice, reuses Sales Returns verbatim.

import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import FinancialAdjustmentListPanel from "@/components/notes/FinancialAdjustmentListPanel";
import ReturnsListPanel from "@/components/returns/ReturnsListPanel";

export default function CreditNote() {
  useEffect(() => { document.title = "Credit Note — RD Pro"; }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Accounts · Notes</p>
        <h1 className="text-2xl font-bold mt-1">Credit Note</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Use <strong>Material Return</strong> when goods are physically coming back from a customer.
          Use <strong>Financial Adjustment</strong> for everything else — freight, discount, rate
          difference, commission, penalty, interest, and similar.
        </p>
      </div>

      <Tabs defaultValue="financial_adjustment">
        <TabsList>
          <TabsTrigger value="financial_adjustment">Financial Adjustment</TabsTrigger>
          <TabsTrigger value="material_return">Material Return (Sales Return based)</TabsTrigger>
        </TabsList>
        <TabsContent value="financial_adjustment" className="pt-4">
          <FinancialAdjustmentListPanel type="Credit Note" hideHeader />
        </TabsContent>
        <TabsContent value="material_return" className="pt-4">
          <ReturnsListPanel kind="sales" hideHeader />
        </TabsContent>
      </Tabs>
    </div>
  );
}
