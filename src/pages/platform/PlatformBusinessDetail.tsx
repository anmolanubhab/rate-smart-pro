import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Clock, CreditCard, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getBusiness360Overview, listBusinessUsers, getBusiness360Activity,
  type Business360Overview, type PlatformBusinessUserRow,
} from "@/lib/platformCustomer360";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function ComingSoonCard({ icon: Icon, title, phase }: { icon: typeof Clock; title: string; phase: string }) {
  return (
    <Card>
      <CardContent className="pt-6 text-center py-12 text-muted-foreground">
        <Icon className="h-8 w-8 mx-auto mb-3" />
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm mt-1">Coming in Phase {phase}</p>
      </CardContent>
    </Card>
  );
}

export default function PlatformBusinessDetail() {
  useEffect(() => { document.title = "RD-Pro Control Center — Business 360"; }, []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<Business360Overview | null>(null);
  const [users, setUsers] = useState<PlatformBusinessUserRow[]>([]);
  const [activity, setActivity] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!id) return;
    getBusiness360Overview(id).then(setOverview).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to load overview"));
    listBusinessUsers(id).then(setUsers).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to load users"));
    getBusiness360Activity(id).then(setActivity).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to load activity"));
  }, [id]);

  if (!overview) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const b = overview.business;
  const name = (b.business_name as string) ?? (b.name as string) ?? "—";

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/platform/businesses")}>
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Businesses
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">{name}</h1>
        <p className="text-sm text-muted-foreground">{(b.owner_name as string) ?? "—"} · {(b.city as string) ?? "—"}</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          {overview.usage && <TabsTrigger value="usage">Usage</TabsTrigger>}
          {overview.financial && <TabsTrigger value="financial">Financial</TabsTrigger>}
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle className="text-base">Business Profile</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3 text-sm">
              <Row label="Business name" value={name} />
              <Row label="Owner" value={(b.owner_name as string) ?? "—"} />
              <Row label="GST number" value={(b.gst_number as string) ?? "—"} />
              <Row label="PAN number" value={(b.pan_number as string) ?? "—"} />
              <Row label="Email" value={(b.email as string) ?? "—"} />
              <Row label="Phone" value={(b.phone as string) ?? (b.mobile as string) ?? "—"} />
              <Row label="Address" value={(b.address as string) ?? "—"} />
              <Row label="City / State" value={`${(b.city as string) ?? "—"} / ${(b.state as string) ?? "—"}`} />
              <Row
                label="Setup"
                value=""
                raw={<Badge variant={b.setup_completed ? "default" : "outline"}>{b.setup_completed ? "Complete" : "Incomplete"}</Badge>}
              />
              <Row label="Created" value={new Date(b.created_at as string).toLocaleDateString()} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader><CardTitle className="text-base">Users ({overview.users_active} active / {overview.users_total} total)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No users.</TableCell></TableRow>}
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </TableCell>
                      <TableCell>{u.role}</TableCell>
                      <TableCell>{u.department ?? "—"}</TableCell>
                      <TableCell><Badge variant={u.status === "active" ? "default" : "outline"}>{u.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {overview.usage && (
          <TabsContent value="usage">
            <Card>
              <CardHeader><CardTitle className="text-base">Usage</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatTile label="Parties" value={overview.usage.parties_count} />
                <StatTile label="Products" value={overview.usage.products_count} />
                <StatTile label="Sales Orders" value={overview.usage.orders_count} />
                <StatTile label="Purchase Orders" value={overview.usage.purchase_orders_count} />
                <StatTile label="Sales Invoices" value={overview.usage.sales_invoices_count} />
                <StatTile label="Purchase Invoices" value={overview.usage.purchase_invoices_count} />
                <StatTile label="Quotations" value={overview.usage.quotations_count} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {overview.financial && (
          <TabsContent value="financial">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Financial</CardTitle>
                <p className="text-xs text-muted-foreground">Invoice-based totals — not a full ledger-netted balance.</p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <StatTile label="Sales Total" value={`₹${overview.financial.sales_total.toLocaleString("en-IN")}`} />
                <StatTile label="Purchase Total" value={`₹${overview.financial.purchase_total.toLocaleString("en-IN")}`} />
                <StatTile label="Sales Outstanding" value={`₹${overview.financial.sales_outstanding.toLocaleString("en-IN")}`} />
                <StatTile label="Purchase Outstanding" value={`₹${overview.financial.purchase_outstanding.toLocaleString("en-IN")}`} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="subscription">
          <ComingSoonCard icon={CreditCard} title="Subscription Management" phase="P5 (Billing)" />
        </TabsContent>

        <TabsContent value="support">
          <ComingSoonCard icon={LifeBuoy} title="Support Ticket History" phase="P6" />
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
            <CardContent>
              {activity.length === 0 && <p className="text-sm text-muted-foreground">No recorded activity yet.</p>}
              <ul className="space-y-2">
                {activity.map((a, i) => (
                  <li key={i} className="text-sm border-b pb-2 last:border-0">
                    <span className="font-medium">{String(a.action)}</span>
                    <span className="text-muted-foreground ml-2">{new Date(String(a.created_at)).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, raw }: { label: string; value: string; raw?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right break-all">{raw ?? value}</span>
    </div>
  );
}
