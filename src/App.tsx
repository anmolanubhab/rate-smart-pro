import { lazy, Suspense, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { NavigationModeProvider } from "@/hooks/useNavigationMode";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import DealerGuard from "@/components/dealer/DealerGuard";
import SalesmanGuard from "@/components/salesman/SalesmanGuard";
import PlatformGuard from "@/components/platform/PlatformGuard";


const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Calculator = lazy(() => import("./pages/Calculator"));
const History = lazy(() => import("./pages/History"));
const Parties = lazy(() => import("./pages/Parties"));
const Profile = lazy(() => import("./pages/Profile"));
const Products = lazy(() => import("./pages/Products"));
const PartyDashboard = lazy(() => import("./pages/parties/PartyDashboard"));
const PartyGroups = lazy(() => import("./pages/masters/PartyGroups"));
const SalesmanGroups = lazy(() => import("./pages/masters/SalesmanGroups"));
const Salesmen = lazy(() => import("./pages/masters/Salesmen"));
const SalesPerformanceReport = lazy(() => import("./pages/reports/SalesPerformanceReport"));
const PartyPartSalesReport = lazy(() => import("./pages/reports/PartyPartSalesReport"));
const BulkGstAssign = lazy(() => import("./pages/inventory/BulkGstAssign"));
const Orders = lazy(() => import("./pages/Orders"));
const CreateOrder = lazy(() => import("./pages/CreateOrder"));
// Dev-only Document Engine gallery (Phase 1A) — intentionally not in navigation/registry.ts,
// and the import itself is dev-only so it (and its route below) are fully excluded from
// the production bundle, not just unreachable at runtime.
const DocumentEngineGallery = import.meta.env.DEV
  ? lazy(() => import("./pages/dev/DocumentEngineGallery"))
  : null;
// Dev-only Universal Document Output Center gallery (Output Center Phase 1) — intentionally not in navigation/registry.ts.
const OutputCenterGallery = import.meta.env.DEV
  ? lazy(() => import("./pages/dev/OutputCenterGallery"))
  : null;
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
const AccountGroups = lazy(() => import("./pages/accounts/AccountGroups"));
const ChartOfAccounts = lazy(() => import("./pages/accounts/ChartOfAccounts"));
const GroupSummary = lazy(() => import("./pages/accounts/GroupSummary"));
const VoucherCenter = lazy(() => import("./pages/accounts/VoucherCenter"));
const DayBook = lazy(() => import("./pages/accounts/DayBook"));
const CashBook = lazy(() => import("./pages/accounts/CashBook"));
const BankBook = lazy(() => import("./pages/accounts/BankBook"));
const BankAccounts = lazy(() => import("./pages/accounts/BankAccounts"));
const TrialBalance = lazy(() => import("./pages/accounts/TrialBalance"));
const ProfitLoss = lazy(() => import("./pages/accounts/ProfitLoss"));
const BalanceSheet = lazy(() => import("./pages/accounts/BalanceSheet"));
const AccountGroupDrillDown = lazy(() => import("./pages/accounts/AccountGroupDrillDown"));
const PartyLedger = lazy(() => import("./pages/accounts/PartyLedger")); // NEW
const Receivables = lazy(() => import("./pages/accounts/Receivables"));
const Payables = lazy(() => import("./pages/accounts/Payables"));
const GstDashboard = lazy(() => import("./pages/gst/GstDashboard"));
const PricingTestBench = lazy(() => import("./pages/pricing/PricingTestBench"));
const PriceLists = lazy(() => import("./pages/pricing/PriceLists"));
const PriceListEditor = lazy(() => import("./pages/pricing/PriceListEditor"));
const PricingRules = lazy(() => import("./pages/pricing/PricingRules"));
const PricingRuleEditor = lazy(() => import("./pages/pricing/PricingRuleEditor"));
const GstSummary = lazy(() => import("./pages/gst/GstSummary"));
const Gstr3B = lazy(() => import("./pages/gst/Gstr3B"));
const Gstr1 = lazy(() => import("./pages/gst/Gstr1"));
const TaxRegister = lazy(() => import("./pages/gst/TaxRegister"));
const HsnSummary = lazy(() => import("./pages/gst/HsnSummary"));
const HsnSummaryPurchase = lazy(() => import("./pages/gst/HsnSummaryPurchase"));
const HsnMaster = lazy(() => import("./pages/gst/HsnMaster"));
const GstConfiguration = lazy(() => import("./pages/gst/GstConfiguration"));
const EInvoiceRegister = lazy(() => import("./pages/gst/EInvoiceRegister"));
const EWayBillRegister = lazy(() => import("./pages/gst/EWayBillRegister"));
const GstFiling = lazy(() => import("./pages/gst/GstFiling"));
const Gstr2Reconciliation = lazy(() => import("./pages/gst/Gstr2Reconciliation"));
const Gstr9 = lazy(() => import("./pages/gst/Gstr9"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const BusinessWizard = lazy(() => import("./pages/setup/BusinessWizard"));
const BusinessProfile = lazy(() => import("./pages/settings/BusinessProfile"));
const CompanyUsers = lazy(() => import("./pages/settings/CompanyUsers"));
const PermissionSystem = lazy(() => import("./pages/settings/PermissionSystem"));
const InventorySettings = lazy(() => import("./pages/settings/InventorySettings"));
const RoundOffSettings = lazy(() => import("./pages/settings/RoundOffSettings"));
const VoucherNumbering = lazy(() => import("./pages/settings/VoucherNumbering"));
const PrintCopyConfiguration = lazy(() => import("./pages/settings/PrintCopyConfiguration"));
const PrintProfiles = lazy(() => import("./pages/settings/PrintProfiles"));
const MeasurementUnits = lazy(() => import("./pages/settings/MeasurementUnits"));
const AccountingLock = lazy(() => import("./pages/settings/AccountingLock"));
const FinancialYears = lazy(() => import("./pages/settings/FinancialYears"));
const OpeningBalanceMigration = lazy(() => import("./pages/settings/OpeningBalanceMigration"));
const FinancialNoteCategories = lazy(() => import("./pages/settings/FinancialNoteCategories"));
const DangerZone = lazy(() => import("./pages/settings/DangerZone"));
const BackupRestore = lazy(() => import("./pages/settings/BackupRestore"));
const Maintenance = lazy(() => import("./pages/settings/Maintenance"));
const CompanySelection = lazy(() => import("./pages/companies/CompanySelection"));
const VerifyCompanyAccess = lazy(() => import("./pages/companies/VerifyCompanyAccess"));
const SalesConfig = lazy(() => import("./pages/settings/SalesConfig"));
const SalesInvoices = lazy(() => import("./pages/sales/Invoices"));
const ReceivePayment = lazy(() => import("./pages/sales/ReceivePayment"));
const PickingList = lazy(() => import("./pages/sales/PickingList"));
const Quotations = lazy(() => import("./pages/sales/Quotations"));
const CreateQuotation = lazy(() => import("./pages/sales/CreateQuotation"));
const SalesReturns = lazy(() => import("./pages/sales/SalesReturns"));
const CreateSalesReturn = lazy(() => import("./pages/sales/CreateSalesReturn"));
const ApprovalCenter = lazy(() => import("./pages/ApprovalCenter"));

// Voucher Engine — foundation pages
const VoucherList   = lazy(() => import("./pages/accounting/VoucherList"));
const VoucherForm   = lazy(() => import("./pages/accounting/VoucherForm"));
const VoucherDetail = lazy(() => import("./pages/accounting/VoucherDetail"));

// Universal Voucher Engine (Phase 1) — keyboard-first Payment/Receipt/Contra/
// Journal/Credit Note/Debit Note entry. VoucherForm above remains the entry
// point for the types this engine doesn't cover (Sales/Purchase/Opening
// Balance) until those migrate to the Document Engine in a later phase.
const PaymentVoucher = lazy(() => import("./pages/vouchers/PaymentVoucher"));
const ReceiptVoucher = lazy(() => import("./pages/vouchers/ReceiptVoucher"));
const ContraVoucher = lazy(() => import("./pages/vouchers/ContraVoucher"));
const JournalVoucher = lazy(() => import("./pages/vouchers/JournalVoucher"));
const CreditNoteVoucher = lazy(() => import("./pages/vouchers/CreditNoteVoucher"));
const DebitNoteVoucher = lazy(() => import("./pages/vouchers/DebitNoteVoucher"));

const PurchaseDashboard = lazy(() => import("./pages/purchase/PurchaseDashboard"));
const PurchaseOrders = lazy(() => import("./pages/purchase/PurchaseOrders"));
const PurchaseGRN = lazy(() => import("./pages/purchase/PurchaseGRN"));
const GRNList = lazy(() => import("./pages/purchase/GRNList"));
const GRNDetail = lazy(() => import("./pages/purchase/GRNDetail"));
const PurchaseInvoices = lazy(() => import("./pages/purchase/PurchaseInvoices"));
const CreatePurchaseInvoice = lazy(() => import("./pages/purchase/CreatePurchaseInvoice"));
const PurchaseInvoiceDetail = lazy(() => import("./pages/purchase/PurchaseInvoiceDetail"));
const PurchasePayments = lazy(() => import("./pages/purchase/PurchasePayments"));
const PurchaseReports = lazy(() => import("./pages/purchase/PurchaseReports"));
const CreatePurchaseOrder = lazy(() => import("./pages/purchase/CreatePurchaseOrder"));

// Phase 3 — Purchase mock screens
const PurchaseReturns = lazy(() => import("./pages/purchase/PurchaseReturns"));
const VendorClaimRegister = lazy(() => import("./pages/purchase/VendorClaimRegister"));
const PurchaseApprovals = lazy(() => import("./pages/purchase/PurchaseApprovals"));
const SupplierLedger = lazy(() => import("./pages/purchase/SupplierLedger"));

// Phase 4 — Inventory mock screens
const Warehouses = lazy(() => import("./pages/inventory/Warehouses"));
const Racking = lazy(() => import("./pages/inventory/Racking"));
const Batches = lazy(() => import("./pages/inventory/Batches"));
const Serials = lazy(() => import("./pages/inventory/Serials"));
const Barcodes = lazy(() => import("./pages/inventory/Barcodes"));
const StockTransfers = lazy(() => import("./pages/inventory/StockTransfers"));
const StockTake = lazy(() => import("./pages/inventory/StockTake"));
const StockTakeDetail = lazy(() => import("./pages/inventory/StockTakeDetail"));
const StockAdjustments = lazy(() => import("./pages/inventory/StockAdjustments"));

// ── Inventory Reports ──────────────────────────────────────────────────────
const InventoryDashboard   = lazy(() => import("./pages/reports/inventory/InventoryDashboard"));
const StockSummary         = lazy(() => import("./pages/reports/inventory/StockSummary"));
const TallyStockSummary    = lazy(() => import("./pages/reports/inventory/TallyStockSummary"));
const StockGroupSummary    = lazy(() => import("./pages/reports/inventory/StockGroupSummary"));
const StockCategorySummary = lazy(() => import("./pages/reports/inventory/StockCategorySummary"));
const WarehouseSummary     = lazy(() => import("./pages/reports/inventory/WarehouseSummary"));
const StockAgeing          = lazy(() => import("./pages/reports/inventory/StockAgeing"));
const DeadStock            = lazy(() => import("./pages/reports/inventory/DeadStock"));
const MovementRegister     = lazy(() => import("./pages/reports/inventory/MovementRegister"));
const StockValuation       = lazy(() => import("./pages/reports/inventory/StockValuation"));
const AbcAnalysis          = lazy(() => import("./pages/reports/inventory/AbcAnalysis"));
const FsnAnalysis          = lazy(() => import("./pages/reports/inventory/FsnAnalysis"));

// Phase 5 — Dedicated Accounts screens
// (Journal/Contra/Payment/Receipt mock pages from ./pages/accounts/VoucherTypes
// retired in favor of the Universal Voucher Engine pages imported above —
// see the /accounts/journal etc. routes below, now pointed at those instead.)
const DebitNote = lazy(() => import("./pages/accounts/DebitNote"));
const CreditNote = lazy(() => import("./pages/accounts/CreditNote"));
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

// Salesman Portal (separate namespace from Dealer Portal — internal-employee
// self-service login, identity via portal_users.role='salesman', not AppLayout)
const SalesmanLogin = lazy(() => import("./pages/salesman/SalesmanLogin"));
const SalesmanAcceptInvite = lazy(() => import("./pages/salesman/SalesmanAcceptInvite"));
const SalesmanLayout = lazy(() => import("./pages/salesman/SalesmanLayout"));
const SalesmanDashboard = lazy(() => import("./pages/salesman/SalesmanDashboard"));
const SalesmanParties = lazy(() => import("./pages/salesman/SalesmanParties"));
const SalesmanPartyDetail = lazy(() => import("./pages/salesman/SalesmanPartyDetail"));
const SalesmanNewOrder = lazy(() => import("./pages/salesman/SalesmanNewOrder"));
const SalesmanOrders = lazy(() => import("./pages/salesman/SalesmanOrders"));
const SalesmanSales = lazy(() => import("./pages/salesman/SalesmanSales"));
const SalesmanPartyProductSales = lazy(() => import("./pages/salesman/SalesmanPartyProductSales"));
const SalesmanOutstanding = lazy(() => import("./pages/salesman/SalesmanOutstanding"));
const SalesmanProfile = lazy(() => import("./pages/salesman/SalesmanProfile"));

// RD-Pro Platform Control Center — internal RD-Pro staff, separate identity/
// security boundary from businesses/business_users (platform_staff, not
// business_role). P1 scaffold: login + a minimal identity/roles/permissions
// dashboard. Later phases add business/support/billing modules here.
const PlatformLogin = lazy(() => import("./pages/platform/PlatformLogin"));
const PlatformLayout = lazy(() => import("@/components/platform/PlatformLayout"));
const PlatformDashboard = lazy(() => import("./pages/platform/PlatformDashboard"));
const PlatformAcceptInvite = lazy(() => import("./pages/platform/PlatformAcceptInvite"));
const PlatformStaffDirectory = lazy(() => import("./pages/platform/PlatformStaffDirectory"));
const PlatformStaffDetail = lazy(() => import("./pages/platform/PlatformStaffDetail"));
const PlatformRoles = lazy(() => import("./pages/platform/PlatformRoles"));
const PlatformOrganization = lazy(() => import("./pages/platform/PlatformOrganization"));
const PlatformApprovalCenter = lazy(() => import("./pages/platform/PlatformApprovalCenter"));
const PlatformApprovalDetail = lazy(() => import("./pages/platform/PlatformApprovalDetail"));
const PlatformMyRequests = lazy(() => import("./pages/platform/PlatformMyRequests"));
const PlatformApprovalRules = lazy(() => import("./pages/platform/PlatformApprovalRules"));
const PlatformBusinesses = lazy(() => import("./pages/platform/PlatformBusinesses"));
const PlatformBusinessDetail = lazy(() => import("./pages/platform/PlatformBusinessDetail"));

const queryClient = new QueryClient();

// Preserves query string when redirecting legacy /dealer/* URLs to /portal/*
const DealerRedirect = ({ to }: { to: string }) => {
  const loc = useLocation();
  return <Navigate to={`${to}${loc.search}`} replace />;
};

// Maps the Universal Voucher Engine's covered types to their route. Sales,
// Purchase, and Opening Balance are NOT covered (they stay on VoucherForm
// until a later phase), so those keys are intentionally absent.
const VOUCHER_ENGINE_PATH: Record<string, string> = {
  payment: "/vouchers/payment",
  receipt: "/vouchers/receipt",
  contra: "/vouchers/contra",
  journal: "/vouchers/journal",
  credit_note: "/vouchers/credit-note",
  debit_note: "/vouchers/debit-note",
};

// /accounting/vouchers/new?type=... — send the 6 covered types to their new
// keyboard-first entry screen; anything else (or no type) keeps using the
// old generic VoucherForm (still rendered by the caller as a fallback).
const NewVoucherRedirect = ({ fallback }: { fallback: React.ReactNode }) => {
  const [params] = useSearchParams();
  const dbType = params.get("type");
  const path = dbType ? VOUCHER_ENGINE_PATH[dbType] : VOUCHER_ENGINE_PATH.journal;
  if (!path) return <>{fallback}</>;
  return <Navigate to={path} replace />;
};

// /accounting/vouchers/:id/edit — same idea, but the type is only known
// after fetching the voucher, so this renders the fallback until resolved.
const EditVoucherRedirect = ({ fallback }: { fallback: React.ReactNode }) => {
  const { id } = useParams<{ id: string }>();
  const [path, setPath] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    import("@/lib/voucherService").then(({ getVoucher, typeToDb }) =>
      getVoucher(id).then((v) => {
        if (cancelled) return;
        const dbType = v ? typeToDb(v.voucher_type) : null;
        setPath(dbType && VOUCHER_ENGINE_PATH[dbType] ? `${VOUCHER_ENGINE_PATH[dbType]}/${id}/edit` : null);
      }).catch(() => !cancelled && setPath(null))
    );
    return () => { cancelled = true; };
  }, [id]);

  if (path === undefined) return <RouteFallback />;
  if (path === null) return <>{fallback}</>;
  return <Navigate to={path} replace />;
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

// Salesman Portal route (guard + its own layout, no AppLayout)
const S = (el: React.ReactNode) => (
  <SalesmanGuard>
    <SalesmanLayout>
      <Suspense fallback={<RouteFallback />}>{el}</Suspense>
    </SalesmanLayout>
  </SalesmanGuard>
);

// RD-Pro Platform Control Center route (guard + its own layout, no AppLayout)
const P = (el: React.ReactNode) => (
  <PlatformGuard>
    <PlatformLayout>
      <Suspense fallback={<RouteFallback />}>{el}</Suspense>
    </PlatformLayout>
  </PlatformGuard>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <NavigationModeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/accept-invite" element={B(<AcceptInvite />)} />
              <Route path="/companies" element={B(<CompanySelection />)} />
              <Route path="/verify-company/:token" element={B(<VerifyCompanyAccess />)} />
              <Route path="/setup/business" element={B(<BusinessWizard />)} />
              <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/calculator" element={L(<Calculator />)} />
              <Route path="/history" element={L(<History />)} />
              <Route path="/parties" element={L(<Parties />)} />
              <Route path="/products" element={L(<Products />)} />
              <Route path="/parties/:partyId" element={L(<PartyDashboard />)} />
              <Route path="/masters/party-groups" element={L(<PartyGroups />)} />
              <Route path="/masters/salesman-groups" element={L(<SalesmanGroups />)} />
              <Route path="/masters/salesmen" element={L(<Salesmen />)} />
              <Route path="/reports/sales-performance" element={L(<SalesPerformanceReport />)} />
              <Route path="/reports/party-part-sales" element={L(<PartyPartSalesReport />)} />
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
              <Route path="/accounts/groups" element={L(<AccountGroups />)} />
              <Route path="/accounts/chart-of-accounts" element={L(<ChartOfAccounts />)} />
              <Route path="/accounts/group-summary" element={L(<GroupSummary />)} />
              <Route path="/accounts/vouchers" element={L(<VoucherCenter />)} />
              <Route path="/accounts/day-book" element={L(<DayBook />)} />
              <Route path="/accounts/cash-book" element={L(<CashBook />)} />
              <Route path="/accounts/bank-book" element={L(<BankBook />)} />
              <Route path="/accounts/bank-accounts" element={L(<BankAccounts />)} />
              <Route path="/accounts/trial-balance" element={L(<TrialBalance />)} />
              <Route path="/accounts/profit-loss" element={L(<ProfitLoss />)} />
              <Route path="/accounts/balance-sheet" element={L(<BalanceSheet />)} />
              <Route path="/accounts/group/:groupId" element={L(<AccountGroupDrillDown />)} />
              <Route path="/accounts/party/:partyId" element={L(<PartyLedger />)} /> {/* NEW */}
              <Route path="/accounts/ledger/:ledgerId" element={L(<PartyLedger />)} />
              <Route path="/accounts/receivables" element={L(<Receivables />)} />
              <Route path="/accounts/payables" element={L(<Payables />)} />
              {/* Voucher Engine — new routes */}
              <Route path="/accounting/vouchers" element={L(<VoucherList />)} />
              <Route path="/accounting/vouchers/new" element={L(<NewVoucherRedirect fallback={<VoucherForm />} />)} />
              <Route path="/accounting/vouchers/:id/edit" element={L(<EditVoucherRedirect fallback={<VoucherForm />} />)} />
              <Route path="/accounting/vouchers/:id" element={L(<VoucherDetail />)} />

              {/* Universal Voucher Engine (Phase 1) — Payment/Receipt/Contra/Journal/Credit Note/Debit Note */}
              <Route path="/vouchers/payment" element={L(<PaymentVoucher />)} />
              <Route path="/vouchers/payment/:id/edit" element={L(<PaymentVoucher />)} />
              <Route path="/vouchers/receipt" element={L(<ReceiptVoucher />)} />
              <Route path="/vouchers/receipt/:id/edit" element={L(<ReceiptVoucher />)} />
              <Route path="/vouchers/contra" element={L(<ContraVoucher />)} />
              <Route path="/vouchers/contra/:id/edit" element={L(<ContraVoucher />)} />
              <Route path="/vouchers/journal" element={L(<JournalVoucher />)} />
              <Route path="/vouchers/journal/:id/edit" element={L(<JournalVoucher />)} />
              <Route path="/vouchers/credit-note" element={L(<CreditNoteVoucher />)} />
              <Route path="/vouchers/credit-note/:id/edit" element={L(<CreditNoteVoucher />)} />
              <Route path="/vouchers/debit-note" element={L(<DebitNoteVoucher />)} />
              <Route path="/vouchers/debit-note/:id/edit" element={L(<DebitNoteVoucher />)} />
              <Route path="/gst/dashboard" element={L(<GstDashboard />)} />
              <Route path="/pricing/test-bench" element={L(<PricingTestBench />)} />
              <Route path="/pricing/price-lists" element={L(<PriceLists />)} />
              <Route path="/pricing/price-lists/:id" element={L(<PriceListEditor />)} />
              <Route path="/pricing/rules" element={L(<PricingRules />)} />
              <Route path="/pricing/rules/:id" element={L(<PricingRuleEditor />)} />
              <Route path="/gst/summary" element={L(<GstSummary />)} />
              <Route path="/gst/gstr-3b" element={L(<Gstr3B />)} />
              <Route path="/gst/gstr-1" element={L(<Gstr1 />)} />
              <Route path="/gst/tax-register" element={L(<TaxRegister />)} />
              <Route path="/gst/hsn-summary" element={L(<HsnSummary />)} />
              <Route path="/gst/hsn-summary-purchase" element={L(<HsnSummaryPurchase />)} />
              <Route path="/gst/hsn-master" element={L(<HsnMaster />)} />
              <Route path="/gst/configuration" element={L(<GstConfiguration />)} />
              <Route path="/gst/einvoice-register" element={L(<EInvoiceRegister />)} />
              <Route path="/gst/ewaybill-register" element={L(<EWayBillRegister />)} />
              <Route path="/gst/filing" element={L(<GstFiling />)} />
              <Route path="/gst/gstr-2-reconciliation" element={L(<Gstr2Reconciliation />)} />
              <Route path="/gst/gstr-9" element={L(<Gstr9 />)} />
              <Route path="/admin/audit-logs" element={L(<AuditLogs />)} />
              <Route path="/settings/business-profile" element={L(<BusinessProfile />)} />
              <Route path="/settings/company-users" element={L(<CompanyUsers />)} />
              <Route path="/settings/permission-system" element={L(<PermissionSystem />)} />
              <Route path="/settings/inventory" element={L(<InventorySettings />)} />
              <Route path="/settings/round-off" element={L(<RoundOffSettings />)} />
              <Route path="/settings/voucher-numbering" element={L(<VoucherNumbering />)} />
              <Route path="/settings/financial-years" element={L(<FinancialYears />)} />
              <Route path="/settings/opening-balance-migration" element={L(<OpeningBalanceMigration />)} />
              <Route path="/settings/print-copies" element={L(<PrintCopyConfiguration />)} />
              <Route path="/settings/print-profiles" element={L(<PrintProfiles />)} />
              <Route path="/settings/measurement-units" element={L(<MeasurementUnits />)} />
              <Route path="/settings/accounting-lock" element={L(<AccountingLock />)} />
              <Route path="/settings/financial-note-categories" element={L(<FinancialNoteCategories />)} />
              <Route path="/settings/sales-config" element={L(<SalesConfig />)} />
              <Route path="/settings/danger-zone" element={L(<DangerZone />)} />
              <Route path="/settings/backup-restore" element={L(<BackupRestore />)} />
              <Route path="/settings/maintenance" element={L(<Maintenance />)} />
              <Route path="/sales/invoices" element={L(<SalesInvoices />)} />
              <Route path="/sales/receive-payment" element={L(<ReceivePayment />)} />
              <Route path="/sales/picking-list" element={L(<PickingList />)} />
              <Route path="/sales/quotations" element={L(<Quotations />)} />
              <Route path="/sales/quotations/new" element={L(<CreateQuotation />)} />
              <Route path="/sales/quotations/edit/:id" element={L(<CreateQuotation />)} />
              <Route path="/sales/returns" element={L(<SalesReturns />)} />
              <Route path="/sales/returns/new" element={L(<CreateSalesReturn />)} />
              <Route path="/sales/returns/edit/:id" element={L(<CreateSalesReturn />)} />
              <Route path="/approval-center" element={L(<ApprovalCenter />)} />
              <Route path="/purchase" element={L(<PurchaseDashboard />)} />
              <Route path="/purchase/orders" element={L(<PurchaseOrders />)} />
              <Route path="/purchase/orders/new" element={L(<CreatePurchaseOrder />)} />
              <Route path="/purchase/orders/edit/:id" element={L(<CreatePurchaseOrder />)} />
              <Route path="/purchase/grn" element={L(<GRNList />)} />
              <Route path="/purchase/grn/new" element={L(<PurchaseGRN />)} />
              <Route path="/purchase/grn/edit/:id" element={L(<PurchaseGRN />)} />
              <Route path="/purchase/grn/:id" element={L(<GRNDetail />)} />
              <Route path="/purchase/invoices" element={L(<PurchaseInvoices />)} />
              <Route path="/purchase/invoices/new" element={L(<CreatePurchaseInvoice />)} />
              <Route path="/purchase/invoices/:id" element={L(<PurchaseInvoiceDetail />)} />
              <Route path="/purchase/payments" element={L(<PurchasePayments />)} />
              <Route path="/purchase/reports" element={L(<PurchaseReports />)} />
              {/* Phase 3 — Purchase mocks */}
              <Route path="/purchase/returns" element={L(<PurchaseReturns />)} />
              <Route path="/purchase/vendor-claims" element={L(<VendorClaimRegister />)} />
              <Route path="/purchase/approvals" element={L(<PurchaseApprovals />)} />
              <Route path="/purchase/supplier-ledger" element={L(<SupplierLedger />)} />
              {/* Phase 4 — Inventory mocks */}
              <Route path="/inventory/warehouses" element={L(<Warehouses />)} />
              <Route path="/inventory/racking" element={L(<Racking />)} />
              <Route path="/inventory/batches" element={L(<Batches />)} />
              <Route path="/inventory/serials" element={L(<Serials />)} />
              <Route path="/inventory/barcodes" element={L(<Barcodes />)} />
              <Route path="/inventory/transfers" element={L(<StockTransfers />)} />
              <Route path="/inventory/stock-take" element={L(<StockTake />)} />
              <Route path="/inventory/stock-take/:id" element={L(<StockTakeDetail />)} />
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

              {/* Salesman Portal — internal-employee self-service, separate from /portal/* (dealers) */}
              <Route path="/salesman/login" element={B(<SalesmanLogin />)} />
              <Route path="/salesman/accept-invite" element={B(<SalesmanAcceptInvite />)} />
              <Route path="/salesman/dashboard" element={S(<SalesmanDashboard />)} />
              <Route path="/salesman/parties" element={S(<SalesmanParties />)} />
              <Route path="/salesman/parties/:id" element={S(<SalesmanPartyDetail />)} />
              <Route path="/salesman/orders" element={S(<SalesmanOrders />)} />
              <Route path="/salesman/orders/new" element={S(<SalesmanNewOrder />)} />
              <Route path="/salesman/orders/edit/:id" element={S(<SalesmanNewOrder />)} />
              <Route path="/salesman/sales" element={S(<SalesmanSales />)} />
              <Route path="/salesman/party-sales" element={S(<SalesmanPartyProductSales />)} />
              <Route path="/salesman/outstanding" element={S(<SalesmanOutstanding />)} />
              <Route path="/salesman/profile" element={S(<SalesmanProfile />)} />

              {/* RD-Pro Platform Control Center — internal RD-Pro staff, separate
                  security boundary from businesses/business_users */}
              <Route path="/platform/login" element={B(<PlatformLogin />)} />
              <Route path="/platform/accept-invite" element={B(<PlatformAcceptInvite />)} />
              <Route path="/platform" element={P(<PlatformDashboard />)} />
              <Route path="/platform/dashboard" element={P(<PlatformDashboard />)} />
              <Route path="/platform/staff" element={P(<PlatformStaffDirectory />)} />
              <Route path="/platform/staff/:id" element={P(<PlatformStaffDetail />)} />
              <Route path="/platform/roles" element={P(<PlatformRoles />)} />
              <Route path="/platform/organization" element={P(<PlatformOrganization />)} />
              <Route path="/platform/approvals" element={P(<PlatformApprovalCenter />)} />
              <Route path="/platform/approvals/:id" element={P(<PlatformApprovalDetail />)} />
              <Route path="/platform/my-requests" element={P(<PlatformMyRequests />)} />
              <Route path="/platform/approval-rules" element={P(<PlatformApprovalRules />)} />
              <Route path="/platform/businesses" element={P(<PlatformBusinesses />)} />
              <Route path="/platform/businesses/:id" element={P(<PlatformBusinessDetail />)} />

              {/* ── Inventory Reports ── */}
              <Route path="/reports/inventory"                   element={L(<InventoryDashboard />)} />
              <Route path="/reports/inventory/stock-summary"     element={L(<StockSummary />)} />
              <Route path="/reports/inventory/stock-summary-tally" element={L(<TallyStockSummary />)} />
              <Route path="/reports/inventory/group-summary"     element={L(<StockGroupSummary />)} />
              <Route path="/reports/inventory/category-summary"  element={L(<StockCategorySummary />)} />
              <Route path="/reports/inventory/warehouse-summary" element={L(<WarehouseSummary />)} />
              <Route path="/reports/inventory/stock-ageing"      element={L(<StockAgeing />)} />
              <Route path="/reports/inventory/dead-stock"        element={L(<DeadStock />)} />
              <Route path="/reports/inventory/movement-register" element={L(<MovementRegister />)} />
              <Route path="/reports/inventory/stock-valuation"   element={L(<StockValuation />)} />
              <Route path="/reports/inventory/abc-analysis"      element={L(<AbcAnalysis />)} />
              <Route path="/reports/inventory/fsn-analysis"      element={L(<FsnAnalysis />)} />

              {import.meta.env.DEV && (
                <>
                  <Route path="/dev/document-engine" element={B(<DocumentEngineGallery />)} />
                  <Route path="/dev/output-center" element={B(<OutputCenterGallery />)} />
                </>
              )}

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
      </NavigationModeProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
