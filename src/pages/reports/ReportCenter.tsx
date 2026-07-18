import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ArrowRight, LayoutGrid } from "lucide-react";
import { useNavigation } from "@/lib/navigation/useNavigation";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Curated catalog of real, navigable reports — grouped by category.
// Every id here MUST exist in the navigation registry (single source of
// truth for route/title/description/icon/permission). If a report isn't
// in the registry yet, it doesn't belong in this list — that's exactly
// the "mock UI" trap this page is designed to avoid.
const CATALOG: { category: string; ids: string[] }[] = [
  { category: "Sales", ids: ["reports-sales-register", "reports"] },
  { category: "Purchase", ids: ["reports-purchase-register", "purchase-reports"] },
  { category: "Party & Outstanding", ids: ["reports-outstanding-ageing", "accounts-receivables", "accounts-payables"] },
  { category: "Accounting", ids: ["accounts-trial-balance", "accounts-profit-loss", "accounts-balance-sheet"] },
  { category: "GST", ids: ["gst-summary"] },
  { category: "History", ids: ["history"] },
];

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

  const allItems = useMemo(() => resolved.flatMap((g) => g.items.map((item) => ({ ...item, category: g.category }))), [resolved]);

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
          Every report here is real and connects to live data — nothing on this page is a placeholder.
        </p>
      </div>

      <div className="grid md:grid-cols-[200px_1fr] gap-6">
        <div className="space-y-1">
          <button
            onClick={() => setActiveCategory("All")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${activeCategory === "All" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
          >
            All Reports <Badge variant="secondary" className="ml-2">{allItems.length}</Badge>
          </button>
          {resolved.map((g) => (
            <button
              key={g.category}
              onClick={() => setActiveCategory(g.category)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between ${activeCategory === g.category ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
            >
              {g.category} <Badge variant="secondary" className="ml-2">{g.items.length}</Badge>
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
                    className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedId === item.id ? "border-primary" : ""}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      {Icon && <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{item.title}</div>
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
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">{selected.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
                  </div>
                  <Link to={selected.route ?? "#"}>
                    <Button className="w-full">
                      Open Report <ArrowRight className="h-4 w-4 ml-1" />
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
    </div>
  );
}
