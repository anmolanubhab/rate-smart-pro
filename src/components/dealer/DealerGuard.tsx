import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useDealerAuth } from "@/hooks/useDealerAuth";

export default function DealerGuard({ children }: { children: ReactNode }) {
  const { user, portalUser, loading } = useDealerAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/portal/login" replace />;
  if (!portalUser || portalUser.portal_type !== "b2b" || portalUser.status !== "active") {
    return <Navigate to="/portal/login" replace />;
  }

  return <>{children}</>;
}
