import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ArrowRight, LayoutGrid, FileBarChart, CheckCircle2, Clock3 } from "lucide-react";
import { useNavigation } from "@/lib/navigation/useNavigation";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Curated catalog of every report — grouped by category. Every id here
// MUST exist in the navigation registry (single source of truth for
// route/title/description/icon/permission). If a report isn't in the
// registry yet, it doesn't belong in this list.
//
// `comingSoonIds`: reports whose page is still mock (verified: 0 real
// Supabase calls). They're shown here — honestly labeled "Coming Soon"
// — rather than hidden, so the Report Center stays the single place to
// discover every report, live or not. Never silently fake real data.
const CATALOG: { category: string; ids: string[] }[] = [
  { category: "Sales", ids: ["reports-sales-register", "reports"] },
  { category: "Purchase", ids: ["reports-purchase-register", "purchase-reports"] },
  { category: "Party & Outstanding", ids: ["reports-outstanding-ageing", "accounts-receivables", "accounts-payables"] },
  { category: "Accounting", ids: ["accounts-trial-balance", "accounts-profit-loss", "accounts-balance-sheet"] },
  { category: "GST", ids: ["gst-summary"] },
  {
    category: "Inventory",
    ids: [
      "inv-reports-dashboard", "inv-stock-summary", "inv-group-summary", "inv-category-summary",
      "inv-warehouse-summary", "inv-stock-ageing", "inv-dead-stock", "inv-movement-register",
      "inv-stock-valuation", "inv-abc-analysis", "inv-fsn-analysis",
    ],
  },
  { category: "History", ids: ["history"] },
];

const COMING_SOON_IDS = new Set([
  "inv-reports-dashboard", "inv-stock-summary", "inv-group-summary", "inv-category-summary",
  "inv-warehouse-summary", "inv-stock-ageing", "inv-dead-stock", "inv-movement-register",
  "inv-stock-valuation", "inv-abc-analysis", "inv-fsn-analysis",
]);

export default function ReportCenter() {
  const { byId } = useNavigation();
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { document.title = "Report Center — RD Pro"; }, []);

  const resolved = useMemo(() => {
    return CATALOG.map((group) => ({
      category: group.category,
      items: group.ids.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x),
    })).filter((g) => g.items.length > 0);
  }, [byId]);

  const allItems = useMemo(
    () => resolved.flatMap((g) => g.items.map((item) => ({ ...item, category: g.category, comingSoon: COMING_SOON_IDS.has(item.id) }))),
    [resolved]
  );

  const liveCount = allItems.filter((i) => !i.comingSoon).length;
  const comingSoonCount = allItems.filter((i) => i.comingSoon).length;

  const filtered = useMemo(() => {
    let items = allItems;
    if (activeCategory !== "All") items = items.filter((i) => i.category === activeCategory);
    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter((i) => i.title.toLowerCase().includes(s) || i.description?.toLowerCase().includes(s));
    }
    return items;
  }, [allItems, activeCategory, search]);

  const selected = selectedId ? allItems.find((i) => i.id === selectedId) : null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <LayoutGrid className="h-4 w-4" /> Reports
        </div>
        <h1 className="text-2xl font-bold">Report Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every report lives here — nothing on this page pretends to be more finished than it is.
        </p>
      </div>

      {/* Dashboard stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileBarChart className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Reports</div>
              <div className="text-lg font-semibold">{allItems.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Live (real data)</div>
              <div className="text-lg font-semibold">{liveCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock3 className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Coming Soon</div>
              <div className="text-lg font-semibold">{comingSoonCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
              <LayoutGrid className="h-4.5 w-4.5 text-violet-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Categories</div>
              <div className="text-lg font-semibold">{resolved.length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setActiveCategory("All")}
          className={`px-3 py-1.5 rounded-full text-sm border ${activeCategory === "All" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
        >
          All <span className="opacity-70">({allItems.length})</span>
        </button>
        {resolved.map((g) => (
          <button
            key={g.category}
            onClick={() => setActiveCategory(g.category)}
            className={`px-3 py-1.5 rounded-full text-sm border ${activeCategory === g.category ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
          >
            {g.category} <span className="opacity-70">({g.items.length})</span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search reports…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map((item) => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedId === item.id ? "border-primary" : ""} ${item.comingSoon ? "opacity-70" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <CardContent className="p-4 flex items-start gap-3">
                    {Icon && <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-sm">{item.title}</div>
                        {item.comingSoon && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Coming Soon</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
                      <Badge variant="outline" className="mt-2 text-[10px]">{item.category}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center text-sm text-muted-foreground py-12">
                No reports match your search.
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:block">
          {selected ? (
            <Card className="sticky top-4">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  {selected.icon && <selected.icon className="h-5 w-5 text-primary" />}
                  <span className="text-xs text-muted-foreground">{selected.category}</span>
                  {selected.comingSoon && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 ml-auto">Coming Soon</Badge>}
                </div>
                <div>
                  <h3 className="font-semibold text-base">{selected.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
                </div>
                {selected.comingSoon ? (
                  <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/40">
                    This report's screen exists but isn't wired to real data yet — opening it will show
                    sample content only, clearly marked as such.
                  </p>
                ) : null}
                <Link to={selected.route ?? "#"}>
                  <Button className="w-full" variant={selected.comingSoon ? "outline" : "default"}>
                    {selected.comingSoon ? "Preview" : "Open Report"} <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="text-sm text-muted-foreground p-5 text-center border rounded-lg border-dashed">
              Select a report to see details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
