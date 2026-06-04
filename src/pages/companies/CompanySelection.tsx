import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { setActiveBusinessId } from "@/hooks/useBusiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Search, LogOut } from "lucide-react";
import { logAudit } from "@/lib/audit";

type Row = {
  business_id: string;
  role: string;
  status: string;
  businesses: {
    id: string;
    business_name: string;
    business_type: string | null;
    gst_number: string | null;
    fy_start_month: number;
    setup_completed: boolean;
    created_at: string;
  } | null;
};

const monthName = (m: number) =>
  ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(m - 1) % 12];

const currentFY = (startMonth: number) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = m >= startMonth ? y : y - 1;
  return `${monthName(startMonth)} ${start} – ${monthName(startMonth - 1 < 1 ? 12 : startMonth - 1)} ${start + 1}`;
};

export default function CompanySelection() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [search, setSearch] = useState("");

  useEffect(() => { document.title = "Select Company — RD Pro"; }, []);

  const q = useQuery({
    queryKey: ["company-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_users")
        .select("business_id, role, status, businesses:business_id ( id, business_name, business_type, gst_number, fy_start_month, setup_completed, created_at )")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const all = (q.data ?? []).filter((r) => r.businesses);
    if (!search.trim()) return all;
    const s = search.toLowerCase();
    return all.filter((r) =>
      (r.businesses!.business_name?.toLowerCase().includes(s)) ||
      (r.businesses!.gst_number ?? "").toLowerCase().includes(s) ||
      (r.businesses!.business_type ?? "").toLowerCase().includes(s)
    );
  }, [q.data, search]);

  const openCompany = async (id: string, name: string) => {
    setActiveBusinessId(id);
    await logAudit({ business_id: id, action: "COMPANY_OPENED", entity_type: "business", entity_id: id, new_value: { name } });
    nav("/dashboard");
  };

  const createNew = () => {
    setActiveBusinessId(null);
    nav("/setup/business?new=1");
  };

  return (
    <div className="min-h-screen bg-background gradient-mesh p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">RD Pro</p>
            <h1 className="font-display text-3xl font-bold mt-1">Select Company</h1>
            <p className="text-sm text-muted-foreground mt-2">Choose a company to open or create a new one.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sign out</Button>
            <Button onClick={createNew}><Plus className="h-4 w-4 mr-2" />Create New Company</Button>
          </div>
        </header>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, GST, type…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading companies…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border bg-card p-12 text-center space-y-4">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-lg">No companies yet</h2>
              <p className="text-sm text-muted-foreground mt-1">Create your first company to start using RD Pro.</p>
            </div>
            <Button onClick={createNew}><Plus className="h-4 w-4 mr-2" />Create New Company</Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => {
              const b = r.businesses!;
              return (
                <button
                  key={b.id}
                  onClick={() => openCompany(b.id, b.business_name)}
                  className="text-left rounded-2xl border bg-card p-5 hover:border-primary hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <Badge variant={b.setup_completed ? "default" : "secondary"}>
                      {b.setup_completed ? "Active" : "Setup pending"}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <h3 className="font-semibold text-base group-hover:text-primary transition-colors line-clamp-1">{b.business_name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">{b.business_type ?? "—"}</p>
                  </div>
                  <dl className="mt-4 space-y-1.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">GST</dt>
                      <dd className="font-mono truncate max-w-[60%]">{b.gst_number || "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">FY</dt>
                      <dd className="truncate max-w-[60%]">{currentFY(b.fy_start_month)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Role</dt>
                      <dd className="capitalize">{r.role}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Created</dt>
                      <dd>{new Date(b.created_at).toLocaleDateString()}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 pt-3 border-t text-xs text-primary font-medium">Open company →</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
