import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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

const Calculator = lazy(() => import("./pages/Calculator"));
const History = lazy(() => import("./pages/History"));
const Parties = lazy(() => import("./pages/Parties"));
const Profile = lazy(() => import("./pages/Profile"));
const Products = lazy(() => import("./pages/Products"));
const Orders = lazy(() => import("./pages/Orders"));
const CreateOrder = lazy(() => import("./pages/CreateOrder"));
const ExcelImport = lazy(() => import("./pages/ExcelImport"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Reports = lazy(() => import("./pages/Reports"));
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
const Receivables = lazy(() => import("./pages/accounts/Receivables"));
const Payables = lazy(() => import("./pages/accounts/Payables"));
const GstSummary = lazy(() => import("./pages/gst/GstSummary"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const BusinessWizard = lazy(() => import("./pages/setup/BusinessWizard"));
const BusinessProfile = lazy(() => import("./pages/settings/BusinessProfile"));
const Team = lazy(() => import("./pages/settings/Team"));
const CompanyUsers = lazy(() => import("./pages/settings/CompanyUsers"));
const VoucherNumbering = lazy(() => import("./pages/settings/VoucherNumbering"));
const CompanySelection = lazy(() => import("./pages/companies/CompanySelection"));
const SalesConfig = lazy(() => import("./pages/settings/SalesConfig"));
const SalesInvoices = lazy(() => import("./pages/sales/Invoices"));

const queryClient = new QueryClient();

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
              <Route path="/companies" element={B(<CompanySelection />)} />
              <Route path="/setup/business" element={B(<BusinessWizard />)} />
              <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/calculator" element={L(<Calculator />)} />
              <Route path="/history" element={L(<History />)} />
              <Route path="/parties" element={L(<Parties />)} />
              <Route path="/products" element={L(<Products />)} />
              <Route path="/orders" element={L(<Orders />)} />
              <Route path="/orders/new" element={L(<CreateOrder />)} />
              <Route path="/orders/edit/:id" element={L(<CreateOrder />)} />
              <Route path="/pending" element={L(<PendingOrders />)} />
              <Route path="/dispatch" element={L(<Dispatch />)} />
              <Route path="/excel-import" element={L(<ExcelImport />)} />
              <Route path="/inventory" element={L(<Inventory />)} />
              <Route path="/reports" element={L(<Reports />)} />
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
              <Route path="/accounts/receivables" element={L(<Receivables />)} />
              <Route path="/accounts/payables" element={L(<Payables />)} />
              <Route path="/gst/summary" element={L(<GstSummary />)} />
              <Route path="/admin/audit-logs" element={L(<AuditLogs />)} />
              <Route path="/settings/business-profile" element={L(<BusinessProfile />)} />
              <Route path="/settings/team" element={L(<Team />)} />
              <Route path="/settings/company-users" element={L(<CompanyUsers />)} />
              <Route path="/settings/voucher-numbering" element={L(<VoucherNumbering />)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
