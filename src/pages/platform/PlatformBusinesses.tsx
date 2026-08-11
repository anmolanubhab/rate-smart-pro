import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBusinesses, type PlatformBusinessRow } from "@/lib/platformCustomer360";

export default function PlatformBusinesses() {
  useEffect(() => { document.title = "RD-Pro Control Center — Businesses"; }, []);
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState<PlatformBusinessRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (s?: string) => {
    setLoading(true);
    try {
      setBusinesses(await listBusinesses(s));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load businesses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Businesses</h1>
        <p className="text-sm text-muted-foreground">All customer businesses on RD-Pro.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input placeholder="Search name, owner, GST, city…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && businesses.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No businesses found.</TableCell></TableRow>
              )}
              {businesses.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => navigate(`/platform/businesses/${b.id}`)}>
                  <TableCell className="font-medium">{b.business_name ?? b.name ?? "—"}</TableCell>
                  <TableCell>{b.owner_name ?? "—"}</TableCell>
                  <TableCell>{b.gst_number ?? "—"}</TableCell>
                  <TableCell>{b.city ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={b.setup_completed ? "default" : "outline"}>
                      {b.setup_completed ? "Complete" : "Incomplete"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
