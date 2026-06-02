import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Boxes, Package, ShoppingCart, Truck, Users, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

function FeedCard({
  title,
  to,
  icon: Icon,
  children,
}: {
  title: string;
  to?: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border shadow-soft p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-display font-semibold truncate">{title}</h3>
        </div>
        {to ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={to}>Open <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ItemSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-28 mt-2" />
      </div>
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function RecentActivityFeed() {
  const { user } = useAuth();

  const salesQ = useQuery({
    queryKey: ["activity-sales", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, order_date, party_name, grand_total, status, created_at")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const purchasesQ = useQuery({
    queryKey: ["activity-purchases", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select("id, voucher_number, voucher_date, total_amount, status")
        .eq("user_id", user!.id)
        .eq("voucher_type", "purchase" as any)
        .order("voucher_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const partiesQ = useQuery({
    queryKey: ["activity-parties", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id, name, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const productsQ = useQuery({
    queryKey: ["activity-products", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, part_number, name, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const dispatchesQ = useQuery({
    queryKey: ["activity-dispatches", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatches")
        .select("id, dispatch_number, dispatch_date, created_at, orders(order_number, party_name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["activity-payments", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select("id, voucher_number, voucher_date, total_amount, status")
        .eq("user_id", user!.id)
        .eq("voucher_type", "payment" as any)
        .order("voucher_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const loading = salesQ.isLoading || purchasesQ.isLoading || partiesQ.isLoading || productsQ.isLoading || dispatchesQ.isLoading || paymentsQ.isLoading;

  const blocks = useMemo(() => {
    const toStatusBadge = (status: string) => (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px]",
          status === "posted" || status === "completed"
            ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/5"
            : status === "draft" || status === "pending" || status === "partial"
              ? "border-amber-500/40 text-amber-700 bg-amber-500/5"
              : "border-destructive/40 text-destructive bg-destructive/5",
        )}
      >
        {status}
      </Badge>
    );

    return {
      sales: (salesQ.data ?? []).map((o) => ({
        title: `${o.order_number} · ${o.party_name || "—"}`,
        meta: `${o.order_date} · ${o.status}`,
        right: inr(o.grand_total || 0),
        badge: toStatusBadge(o.status),
      })),
      purchases: (purchasesQ.data ?? []).map((v) => ({
        title: `${v.voucher_number}`,
        meta: `${v.voucher_date}`,
        right: inr(v.total_amount || 0),
        badge: toStatusBadge(v.status),
      })),
      parties: (partiesQ.data ?? []).map((p) => ({
        title: p.name,
        meta: new Date(p.created_at).toLocaleDateString("en-IN"),
      })),
      products: (productsQ.data ?? []).map((p) => ({
        title: `${p.part_number} · ${p.name}`,
        meta: new Date(p.created_at).toLocaleDateString("en-IN"),
      })),
      dispatches: (dispatchesQ.data ?? []).map((d) => ({
        title: `${d.dispatch_number} · ${d.orders?.order_number || "—"}`,
        meta: `${d.dispatch_date} · ${d.orders?.party_name || "—"}`,
      })),
      payments: (paymentsQ.data ?? []).map((v) => ({
        title: `${v.voucher_number}`,
        meta: `${v.voucher_date}`,
        right: inr(v.total_amount || 0),
        badge: toStatusBadge(v.status),
      })),
    };
  }, [dispatchesQ.data, partiesQ.data, paymentsQ.data, productsQ.data, purchasesQ.data, salesQ.data]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-bold">Recent Activity</h2>
        <p className="text-sm text-muted-foreground">Latest transactions and master updates across the system.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <FeedCard title="Latest Sales" to="/orders" icon={ShoppingCart}>
          {loading ? (
            <div className="space-y-2"><ItemSkeleton /><ItemSkeleton /><ItemSkeleton /></div>
          ) : blocks.sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent orders.</p>
          ) : (
            <div className="space-y-2">
              {blocks.sales.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="truncate">{i.meta}</span>
                      {i.badge}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">{i.right}</div>
                </div>
              ))}
            </div>
          )}
        </FeedCard>

        <FeedCard title="Latest Purchases" to="/accounts/vouchers" icon={Boxes}>
          {loading ? (
            <div className="space-y-2"><ItemSkeleton /><ItemSkeleton /><ItemSkeleton /></div>
          ) : blocks.purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase vouchers.</p>
          ) : (
            <div className="space-y-2">
              {blocks.purchases.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{i.meta}</span>
                      {i.badge}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">{i.right}</div>
                </div>
              ))}
            </div>
          )}
        </FeedCard>

        <FeedCard title="Latest Payments" to="/accounts/vouchers" icon={Wallet}>
          {loading ? (
            <div className="space-y-2"><ItemSkeleton /><ItemSkeleton /><ItemSkeleton /></div>
          ) : blocks.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment vouchers.</p>
          ) : (
            <div className="space-y-2">
              {blocks.payments.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{i.meta}</span>
                      {i.badge}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">{i.right}</div>
                </div>
              ))}
            </div>
          )}
        </FeedCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <FeedCard title="Latest Parties" to="/parties" icon={Users}>
          {loading ? (
            <div className="space-y-2"><ItemSkeleton /><ItemSkeleton /><ItemSkeleton /></div>
          ) : blocks.parties.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent parties.</p>
          ) : (
            <div className="space-y-2">
              {blocks.parties.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.title}</div>
                    <div className="text-xs text-muted-foreground">{i.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FeedCard>

        <FeedCard title="Latest Products" to="/products" icon={Package}>
          {loading ? (
            <div className="space-y-2"><ItemSkeleton /><ItemSkeleton /><ItemSkeleton /></div>
          ) : blocks.products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent products.</p>
          ) : (
            <div className="space-y-2">
              {blocks.products.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.title}</div>
                    <div className="text-xs text-muted-foreground">{i.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FeedCard>

        <FeedCard title="Latest Dispatches" to="/dispatch" icon={Truck}>
          {loading ? (
            <div className="space-y-2"><ItemSkeleton /><ItemSkeleton /><ItemSkeleton /></div>
          ) : blocks.dispatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent dispatches.</p>
          ) : (
            <div className="space-y-2">
              {blocks.dispatches.map((i, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-smooth">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.title}</div>
                    <div className="text-xs text-muted-foreground">{i.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FeedCard>
      </div>
    </section>
  );
}


