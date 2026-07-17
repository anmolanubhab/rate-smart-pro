import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import DealerGuard from "@/components/dealer/DealerGuard";


const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Calculator = lazy(() => import("./pages/Calculator"));
const History = lazy(() => import("./pages/History"));
const Parties = lazy(() => import("./pages/Parties"));
const Profile = lazy(() => import("./pages/Profile"));
const Products = lazy(() => import("./pages/Products"));
const PartyDashboard = lazy(() => import("./pages/parties/PartyDashboard"));
const PartyGroups = lazy(() => import("./pages/masters/PartyGroups"));
const BulkGstAssign = lazy(() => import("./pages/inventory/BulkGstAssign"));
const Orders = lazy(() => import("./pages/Orders"));
const CreateOrder = lazy(() => import("./pages/CreateOrder"));
const ExcelImport = lazy(() => import("./pages/ExcelImport"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Reports = lazy(() => import("./pages/Reports"));
const SalesRegister = lazy(() => import("./pages/reports/SalesRegister"));
const ReportCenter = lazy(() => import("./pages/reports/ReportCenter"));
const PurchaseRegister = lazy(() => import("./pages/reports/PurchaseRegister"));
const OutstandingAgeing = lazy(() => import("./pages/reports/OutstandingAgeing"));
const Settings = lazy(() => import("./pages/Settings"));
const PendingOrders = lazy(() => import("./pages/PendingOrders"));
const Dispatch = lazy(() => import("./pages/Dispatch"));

const LedgerAccounts = lazy(() => import("./pages/accounts/LedgerAccounts"));
const VoucherCenter = lazy(() => import("./pages/accounts/VoucherCenter"));
const DayBook = lazy(() => import("./pages/accounts/DayBook"));
const CashBook = lazy(() => import("./pages/accounts/CashBook"));
const BankBook = lazy(() => import("./pages/accounts/BankBook"));
const TrialBalance = lazy(() => import("./pages/accounts/TrialBalance"));
const ProfitLoss = lazy(() => import("./pages/accounts/ProfitLoss"));
const BalanceSheet = lazy(() => import("./pages/accounts/BalanceSheet"));
const PartyLedger = lazy(() => import("./pages/accounts/PartyLedger")); // NEW
const Receivables = lazy(() => import("./pages/accounts/Receivables"));
const Payables = lazy(() => import("./pages/accounts/Payables"));
const GstSummary = lazy(() => import("./pages/gst/GstSummary"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const BusinessWizard = lazy(() => import("./pages/setup/BusinessWizard"));
const BusinessProfile = lazy(() => import("./pages/settings/BusinessProfile"));
const Team = lazy(() => import("./pages/settings/Team"));
const CompanyUsers = lazy(() => import("./pages/settings/CompanyUsers"));
const VoucherNumbering = lazy(() => import("./pages/settings/VoucherNumbering"));
const MeasurementUnits = lazy(() => import("./pages/settings/MeasurementUnits"));
const AccountingLock = lazy(() => import("./pages/settings/AccountingLock"));
const DangerZone = lazy(() => import("./pages/settings/DangerZone"));
const CompanySelection = lazy(() => import("./pages/companies/CompanySelection"));
const SalesConfig = lazy(() => import("./pages/settings/SalesConfig"));
const SalesInvoices = lazy(() => import("./pages/sales/Invoices"));
const ApprovalCenter = lazy(() => import("./pages/ApprovalCenter"));

// Voucher Engine — foundation pages
const VoucherList   = lazy(() => import("./pages/accounting/VoucherList"));
const VoucherForm   = lazy(() => import("./pages/accounting/VoucherForm"));
const VoucherDetail = lazy(() => import("./pages/accounting/VoucherDetail"));

const PurchaseDashboard = lazy(() => import("./pages/purchase/PurchaseDashboard"));
const PurchaseOrders = lazy(() => import("./pages/purchase/PurchaseOrders"));
const PurchaseGRN = lazy(() => import("./pages/purchase/PurchaseGRN"));
const PurchaseInvoices = lazy(() => import("./pages/purchase/PurchaseInvoices"));
const PurchasePayments = lazy(() => import("./pages/purchase/PurchasePayments"));
const PurchaseReports = lazy(() => import("./pages/purchase/PurchaseReports"));
const CreatePurchaseOrder = lazy(() => import("./pages/purchase/CreatePurchaseOrder"));

// Phase 3 — Purchase mock screens
const PurchaseReturns = lazy(() => import("./pages/purchase/PurchaseReturns"));
const PurchaseApprovals = lazy(() => import("./pages/purchase/PurchaseApprovals"));
const SupplierLedger = lazy(() => import("./pages/purchase/SupplierLedger"));

// Phase 4 — Inventory mock screens
const Warehouses = lazy(() => import("./pages/inventory/Warehouses"));
const Batches = lazy(() => import("./pages/inventory/Batches"));
const Serials = lazy(() => import("./pages/inventory/Serials"));
const Barcodes = lazy(() => import("./pages/inventory/Barcodes"));
const StockTransfers = lazy(() => import("./pages/inventory/StockTransfers"));
const StockTake = lazy(() => import("./pages/inventory/StockTake"));
const StockAdjustments = lazy(() => import("./pages/inventory/StockAdjustments"));

// Phase 5 — Dedicated Accounts screens
const JournalVoucher = lazy(() => import("./pages/accounts/VoucherTypes").then(m => ({ default: m.JournalVoucher })));
const ContraVoucher = lazy(() => import("./pages/accounts/VoucherTypes").then(m => ({ default: m.ContraVoucher })));
const PaymentVoucher = lazy(() => import("./pages/accounts/VoucherTypes").then(m => ({ default: m.PaymentVoucher })));
const ReceiptVoucher = lazy(() => import("./pages/accounts/VoucherTypes").then(m => ({ default: m.ReceiptVoucher })));
const DebitNote = lazy(() => import("./pages/accounts/VoucherTypes").then(m => ({ default: m.DebitNote })));
const CreditNote = lazy(() => import("./pages/accounts/VoucherTypes").then(m => ({ default: m.CreditNote })));
const CashFlow = lazy(() => import("./pages/accounts/CashFlow"));

// Phase 6 — Dealer portal (separate namespace, no AppLayout)
const DealerLogin = lazy(() => import("./pages/dealer/DealerLogin"));
const DealerApply = lazy(() => import("./pages/dealer/DealerApply"));
const DealerDashboard = lazy(() => import("./pages/dealer/DealerDashboard"));
const DealerOrder = lazy(() => import("./pages/dealer/DealerOrder"));
const DealerPricing = lazy(() => import("./pages/dealer/DealerPricing"));
const DealerOutstanding = lazy(() => import("./pages/dealer/DealerOutstanding"));
const DealerLedger = lazy(() => import("./pages/dealer/DealerLedger"));
const DealerApplications = lazy(() => import("./pages/settings/DealerApplications"));

const queryClient = new QueryClient();

// Preserves query string when redirecting legacy /dealer/* URLs to /portal/*
const DealerRedirect = ({ to }: { to: string }) => {
  const loc = useLocation();
  return <Navigate to={`${to}${loc.search}`} replace />;
};

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-[40vh] text-sm text-muted-foreground">Loading…</div>
);

const L = (el: React.ReactNode) => (
  <AppLayout>
    <Suspense fallback={<RouteFallback />}>{el}</Suspense>
  </AppLayout>
);

// Bare route (no AppLayout) — for pre-company screens
const B = (el: React.ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{el}</Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/accept-invite" element={B(<AcceptInvite />)} />
              <Route path="/companies" element={B(<CompanySelection />)} />
              <Route path="/setup/business" element={B(<BusinessWizard />)} />
              <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/calculator" element={L(<Calculator />)} />
              <Route path="/history" element={L(<History />)} />
              <Route path="/parties" element={L(<Parties />)} />
              <Route path="/products" element={L(<Products />)} />
              <Route path="/parties/:partyId" element={L(<PartyDashboard />)} />
              <Route path="/masters/party-groups" element={L(<PartyGroups />)} />
              <Route path="/products/bulk-gst" element={L(<BulkGstAssign />)} />
              <Route path="/orders" element={L(<Orders />)} />
              <Route path="/orders/new" element={L(<CreateOrder />)} />
              <Route path="/orders/edit/:id" element={L(<CreateOrder />)} />
              <Route path="/pending" element={L(<PendingOrders />)} />
              <Route path="/dispatch" element={L(<Dispatch />)} />
              <Route path="/excel-import" element={L(<ExcelImport />)} />
              <Route path="/inventory" element={L(<Inventory />)} />
              <Route path="/reports" element={L(<Reports />)} />
              <Route path="/reports/sales-register" element={L(<SalesRegister />)} />
              <Route path="/reports/center" element={L(<ReportCenter />)} />

<Route
  path="/reports/purchase-register"
  element={L(<PurchaseRegister />)}
/>

<Route
  path="/reports/outstanding-ageing"
  element={L(<OutstandingAgeing />)}
/>
              <Route path="/settings" element={L(<Settings />)} />
              <Route path="/profile" element={L(<Profile />)} />
              <Route path="/accounts/ledgers" element={L(<LedgerAccounts />)} />
              <Route path="/accounts/vouchers" element={L(<VoucherCenter />)} />
              <Route path="/accounts/day-book" element={L(<DayBook />)} />
              <Route path="/accounts/cash-book" element={L(<CashBook />)} />
              <Route path="/accounts/bank-book" element={L(<BankBook />)} />
              <Route path="/accounts/trial-balance" element={L(<TrialBalance />)} />
              <Route path="/accounts/profit-loss" element={L(<ProfitLoss />)} />
              <Route path="/accounts/balance-sheet" element={L(<BalanceSheet />)} />
              <Route path="/accounts/party/:partyId" element={L(<PartyLedger />)} /> {/* NEW */}
              <Route path="/accounts/receivables" element={L(<Receivables />)} />
              <Route path="/accounts/payables" element={L(<Payables />)} />
              {/* Voucher Engine — new routes */}
              <Route path="/accounting/vouchers" element={L(<VoucherList />)} />
              <Route path="/accounting/vouchers/new" element={L(<VoucherForm />)} />
              <Route path="/accounting/vouchers/:id/edit" element={L(<VoucherForm />)} />
              <Route path="/accounting/vouchers/:id" element={L(<VoucherDetail />)} />
              <Route path="/gst/summary" element={L(<GstSummary />)} />
              <Route path="/admin/audit-logs" element={L(<AuditLogs />)} />
              <Route path="/settings/business-profile" element={L(<BusinessProfile />)} />
              <Route path="/settings/team" element={L(<Team />)} />
              <Route path="/settings/company-users" element={L(<CompanyUsers />)} />
              <Route path="/settings/voucher-numbering" element={L(<VoucherNumbering />)} />
              <Route path="/settings/measurement-units" element={L(<MeasurementUnits />)} />
              <Route path="/settings/accounting-lock" element={L(<AccountingLock />)} />
              <Route path="/settings/sales-config" element={L(<SalesConfig />)} />
              <Route path="/settings/danger-zone" element={L(<DangerZone />)} />
              <Route path="/sales/invoices" element={L(<SalesInvoices />)} />
              <Route path="/approval-center" element={L(<ApprovalCenter />)} />
              <Route path="/purchase" element={L(<PurchaseDashboard />)} />
              <Route path="/purchase/orders" element={L(<PurchaseOrders />)} />
              <Route path="/purchase/orders/new" element={L(<CreatePurchaseOrder />)} />
              <Route path="/purchase/orders/edit/:id" element={L(<CreatePurchaseOrder />)} />
              <Route path="/purchase/grn" element={L(<PurchaseGRN />)} />
              <Route path="/purchase/invoices" element={L(<PurchaseInvoices />)} />
              <Route path="/purchase/payments" element={L(<PurchasePayments />)} />
              <Route path="/purchase/reports" element={L(<PurchaseReports />)} />
              {/* Phase 3 — Purchase mocks */}
              <Route path="/purchase/returns" element={L(<PurchaseReturns />)} />
              <Route path="/purchase/approvals" element={L(<PurchaseApprovals />)} />
              <Route path="/purchase/supplier-ledger" element={L(<SupplierLedger />)} />
              {/* Phase 4 — Inventory mocks */}
              <Route path="/inventory/warehouses" element={L(<Warehouses />)} />
              <Route path="/inventory/batches" element={L(<Batches />)} />
              <Route path="/inventory/serials" element={L(<Serials />)} />
              <Route path="/inventory/barcodes" element={L(<Barcodes />)} />
              <Route path="/inventory/transfers" element={L(<StockTransfers />)} />
              <Route path="/inventory/stock-take" element={L(<StockTake />)} />
              <Route path="/inventory/adjustments" element={L(<StockAdjustments />)} />
              {/* Phase 5 — Dedicated Accounts */}
              <Route path="/accounts/journal" element={L(<JournalVoucher />)} />
              <Route path="/accounts/contra" element={L(<ContraVoucher />)} />
              <Route path="/accounts/payment" element={L(<PaymentVoucher />)} />
              <Route path="/accounts/receipt" element={L(<ReceiptVoucher />)} />
              <Route path="/accounts/debit-note" element={L(<DebitNote />)} />
              <Route path="/accounts/credit-note" element={L(<CreditNote />)} />
              <Route path="/accounts/cash-flow" element={L(<CashFlow />)} />
              {/* Phase 6 — Portal (formerly /dealer/*) */}
              <Route path="/portal" element={B(<DealerLogin />)} />
              <Route path="/portal/login" element={B(<DealerLogin />)} />
              <Route path="/portal/apply" element={B(<DealerApply />)} />
              <Route path="/portal/dashboard" element={<DealerGuard>{B(<DealerDashboard />)}</DealerGuard>} />
              <Route path="/portal/order" element={<DealerGuard>{B(<DealerOrder />)}</DealerGuard>} />
              <Route path="/portal/pricing" element={<DealerGuard>{B(<DealerPricing />)}</DealerGuard>} />
              <Route path="/portal/outstanding" element={<DealerGuard>{B(<DealerOutstanding />)}</DealerGuard>} />
              <Route path="/portal/ledger" element={<DealerGuard>{B(<DealerLedger />)}</DealerGuard>} />
              {/* Backward-compatible /dealer/* → /portal/* redirects (preserve query string) */}
              <Route path="/dealer"              element={<DealerRedirect to="/portal/login" />} />
              <Route path="/dealer/login"        element={<DealerRedirect to="/portal/login" />} />
              <Route path="/dealer/apply"        element={<DealerRedirect to="/portal/apply" />} />
              <Route path="/dealer/dashboard"    element={<DealerRedirect to="/portal/dashboard" />} />
              <Route path="/dealer/order"        element={<DealerRedirect to="/portal/order" />} />
              <Route path="/dealer/pricing"      element={<DealerRedirect to="/portal/pricing" />} />
              <Route path="/dealer/outstanding"  element={<DealerRedirect to="/portal/outstanding" />} />
              <Route path="/dealer/ledger"       element={<DealerRedirect to="/portal/ledger" />} />
              {/* Internal admin — review dealer applications */}
              <Route path="/settings/dealer-applications" element={L(<DealerApplications />)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
