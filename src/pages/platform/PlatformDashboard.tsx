import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";

export default function PlatformDashboard() {
  useEffect(() => { document.title = "RD-Pro Control Center — Dashboard"; }, []);
  const { platformStaff, roles, permissions } = usePlatformAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Control Center</h1>
        <p className="text-sm text-muted-foreground">
          Phase P1 scaffold — identity, roles, permissions, audit, and approvals are wired up.
          Business/support/billing modules land in later phases.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signed in as</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Name: </span>
            {platformStaff?.full_name ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            {platformStaff?.email ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Status: </span>
            <Badge variant={platformStaff?.status === "active" ? "default" : "destructive"}>
              {platformStaff?.status ?? "unknown"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {roles.length === 0 && <span className="text-sm text-muted-foreground">No roles assigned.</span>}
          {roles.map((r) => (
            <Badge key={r.id} variant="secondary">{r.name} (level {r.level})</Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Effective permissions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {permissions.length === 0 && <span className="text-sm text-muted-foreground">No permissions granted.</span>}
          {permissions.map((p) => (
            <Badge key={p} variant="outline">{p}</Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
