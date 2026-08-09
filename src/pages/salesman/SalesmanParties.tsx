import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";
import { fetchSalesmanParties, type SalesmanPartiesSort } from "@/lib/salesmanPortal/parties";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const PAGE_SIZE = 20;

export default function SalesmanParties() {
  useEffect(() => { document.title = "My Parties — Salesman Portal"; }, []);
  const { salesmanUser } = useSalesmanAuth();
  const salesmanId = salesmanUser?.salesman_id;
  const businessId = salesmanUser?.business_id;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SalesmanPartiesSort>("name");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ["salesman-portal-parties", salesmanId, search, sort, ascending, page],
    enabled: !!salesmanId && !!businessId,
    queryFn: () => fetchSalesmanParties({
      salesmanId: salesmanId!, businessId: businessId!, search, sort, ascending, page, pageSize: PAGE_SIZE,
    }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleSort = (col: SalesmanPartiesSort) => {
    if (sort === col) setAscending((a) => !a);
    else { setSort(col); setAscending(true); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">My Parties</h1>
        <p className="text-sm text-muted-foreground">{total} parties assigned to you</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone or city…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="md" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">No parties found.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2.5">
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("name")}>
                      Party Name <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5">Phone</th>
                  <th className="px-4 py-2.5">
                    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("city")}>
                      City <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-right">
                    <button className="flex items-center gap-1 ml-auto hover:text-foreground" onClick={() => toggleSort("outstanding_balance")}>
                      Outstanding <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link to={`/salesman/parties/${p.id}`} className="font-medium hover:text-primary">{p.name}</Link>
                    </td>
                    <td className="px-4 py-2.5">{p.phone ?? "—"}</td>
                    <td className="px-4 py-2.5">{p.city ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">{inr(p.outstanding_balance)}</td>
                    <td className="px-4 py-2.5 capitalize">{p.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((p) => (
              <Link
                key={p.id}
                to={`/salesman/parties/${p.id}`}
                className="block rounded-xl border bg-card p-3 shadow-sm active:bg-muted/40"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm font-medium">{inr(p.outstanding_balance)}</div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {p.phone ?? "—"} {p.city ? `· ${p.city}` : ""}
                </div>
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
