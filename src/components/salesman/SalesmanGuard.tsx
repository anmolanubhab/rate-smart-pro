import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSalesmanAuth } from "@/hooks/useSalesmanAuth";

export default function SalesmanGuard({ children }: { children: ReactNode }) {
  const { user, salesmanUser, loading } = useSalesmanAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/salesman/login" replace />;
  if (!salesmanUser || salesmanUser.role !== "salesman" || salesmanUser.status !== "active") {
    return <Navigate to="/salesman/login" replace />;
  }

  return <>{children}</>;
}
