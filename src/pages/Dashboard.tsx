import { Suspense, lazy, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LayoutDashboard, Landmark, Boxes, ShoppingCart, TruckIcon, Store,
  BarChart3, Activity as ActivityIcon, FileText, Wallet, PackageCheck,
  ClipboardList, ReceiptText, Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getSectionOrder } from "@/lib/dashboardFocus";
import QuickLinksPanel from "@/components/dashboard/QuickLinksPanel";

const InventoryWidgets = lazy(() => import("@/components/InventoryWidgets"));
const BusinessHealthLayer = lazy(() => import("@/components/dashboard/BusinessHealthLayer"));
const OperationsLayer = lazy(() => import("@/components/dashboard/OperationsLayer"));
const AccountingLayer = lazy(() => import("@/components/dashboard/AccountingLayer"));
const BusinessTrendCharts = lazy(() => import("@/components/dashboard/BusinessTrendCharts"));
const RecentActivityFeed = lazy(() => import("@/components/dashboard/RecentActivityFeed"));
const OnlineCommercePlaceholders = lazy(() => import("@/components/dashboard/OnlineCommercePlaceholders"));
const LegacyCalculatorPanel = lazy(() => import("@/components/dashboard/LegacyCalculatorPanel"));

// Workspace tabs. Only the active tab's section(s) actually mount — everything
// else stays unrequested (no chunk load, no query) until the user clicks it.
// See docs note in git history: this replaced a single long page where all
// 7+ sections (plus a legacy analytics block) rendered and fetched at once.
const TABS = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "accounting", label: "Accounting", icon: Landmark },
  { value: "inventory", label: "Inventory", icon: Boxes },
  { value: "sales", label: "Sales", icon: ShoppingCart },
  { value: "purchase", label: "Purchase", icon: TruckIcon },
  { value: "commerce", label: "Commerce", icon: Store },
  { value: "reports", label: "Reports", icon: BarChart3 },
  { value: "activity", label: "Activity", icon: ActivityIcon },
] as const;
type TabValue = (typeof TABS)[number]["value"];
const TAB_VALUES = TABS.map((t) => t.value) as string[];

const SALES_LINKS = [
  { label: "Orders", description: "Pending and confirmed sales orders", to: "/orders", icon: ClipboardList },
  { label: "Dispatch", description: "Pick, pack and dispatch stock", to: "/dispatch", icon: PackageCheck },
  { label: "Invoices", description: "Sales invoices and tax documents", to: "/sales/invoices", icon: FileText },
  { label: "Collection", description: "Receive payments against invoices", to: "/sales/receive-payment", icon: Wallet },
];

const PURCHASE_LINKS = [
  { label: "Purchase Orders", description: "Raise and track POs to suppliers", to: "/purchase/orders", icon: ClipboardList },
  { label: "GRN", description: "Goods receipt and put-away", to: "/purchase/grn", icon: PackageCheck },
  { label: "Supplier Ledger", description: "Outstanding dues by supplier", to: "/purchase/supplier-ledger", icon: Users },
  { label: "Purchase Invoices", description: "Bills recorded against POs/GRNs", to: "/purchase/invoices", icon: ReceiptText },
];

const Dashboard = () => {
  const { user } = useAuth();
  const { dashboardFocus } = useBusiness();
  const [searchParams, setSearchParams] = useSearchParams();

  const requested = searchParams.get("tab");
  const activeTab: TabValue = (requested && TAB_VALUES.includes(requested) ? requested : "overview") as TabValue;
  const setActiveTab = (v: string) => setSearchParams((p) => { p.set("tab", v); return p; }, { replace: true });

  // "Dashboard Focus" only ever reordered health/operations/inventory/accounting
  // relative to each other; inventory and accounting now live on their own
  // tabs, so the preference is left to reorder just the two Overview widgets.
  const overviewOrder = useMemo(
    () => getSectionOrder(dashboardFocus).filter((k) => k === "health" || k === "operations"),
    [dashboardFocus],
  );
  const OVERVIEW_COMPONENT: Record<string, React.ComponentType> = {
    health: BusinessHealthLayer,
    operations: OperationsLayer,
  };

  const [displayName, setDisplayName] = useState("");
  const [nameLoading, setNameLoading] = useState(true);

  useEffect(() => {
    document.title = "Dashboard — RD Calculator Pro";
  }, []);

  useEffect(() => {
    if (!user) {
      setNameLoading(false);
      return;
    }
    const loadProfile = async () => {
      try {
        const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
        if (data?.full_name) {
          setDisplayName(data.full_name);
        } else if (user.user_metadata?.full_name) {
          setDisplayName(user.user_metadata.full_name);
        } else {
          setDisplayName(user.email?.split("@")[0] || "User");
        }
      } catch (err) {
        console.error("Failed to load profile name:", err);
        setDisplayName(user.email?.split("@")[0] || "User");
      } finally {
        setNameLoading(false);
      }
    };
    loadProfile();
  }, [user]);

  if (nameLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">Welcome back</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mt-1">
            {nameLoading ? <Skeleton className="h-10 w-48" /> : displayName}
          </h1>
          <p className="text-muted-foreground mt-1">Business Health Control Center.</p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 flex-wrap md:flex-nowrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Radix only renders the active TabsContent's children into the tree —
            everything else stays unmounted, so its lazy chunk never loads and
            its queries never fire until the user actually clicks that tab. */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {overviewOrder.map((key) => {
            const SectionComponent = OVERVIEW_COMPONENT[key];
            return (
              <Suspense key={key} fallback={<SectionFallback />}>
                <SectionComponent />
              </Suspense>
            );
          })}
        </TabsContent>

        <TabsContent value="accounting" className="mt-6">
          <Suspense fallback={<SectionFallback />}>
            <AccountingLayer />
          </Suspense>
        </TabsContent>

        <TabsContent value="inventory" className="mt-6">
          <Suspense fallback={<SectionFallback />}>
            <InventoryWidgets />
          </Suspense>
        </TabsContent>

        <TabsContent value="sales" className="mt-6">
          <QuickLinksPanel title="Sales" subtitle="Jump straight into the sales workflow." links={SALES_LINKS} />
        </TabsContent>

        <TabsContent value="purchase" className="mt-6">
          <QuickLinksPanel title="Purchase" subtitle="Jump straight into the purchase workflow." links={PURCHASE_LINKS} />
        </TabsContent>

        <TabsContent value="commerce" className="mt-6">
          <Suspense fallback={<SectionFallback />}>
            <OnlineCommercePlaceholders />
          </Suspense>
        </TabsContent>

        <TabsContent value="reports" className="space-y-8 mt-6">
          <section className="space-y-3">
            <div>
              <h2 className="font-display text-xl font-bold">Charts</h2>
              <p className="text-sm text-muted-foreground">Business trends across sales, purchase, receivables and inventory.</p>
            </div>
            <Suspense fallback={<ChartsFallback />}>
              <BusinessTrendCharts />
            </Suspense>
          </section>
          <Suspense fallback={<SectionFallback />}>
            <LegacyCalculatorPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Suspense fallback={<SectionFallback />}>
            <RecentActivityFeed />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const SectionFallback = () => (
  <div className={cn("rounded-2xl bg-card border border-border shadow-soft p-6")}>
    <Skeleton className="h-4 w-48" />
    <Skeleton className="h-3 w-80 mt-2" />
    <Skeleton className="h-24 w-full mt-5" />
  </div>
);

const ChartsFallback = () => (
  <div className="grid lg:grid-cols-2 gap-4">
    <SectionFallback />
    <SectionFallback />
    <SectionFallback />
    <SectionFallback />
  </div>
);

export default Dashboard;
