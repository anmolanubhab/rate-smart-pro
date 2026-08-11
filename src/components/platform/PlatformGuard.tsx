import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePlatformAuth } from "@/hooks/usePlatformAuth";

export default function PlatformGuard({ children }: { children: ReactNode }) {
  const { user, platformStaff, loading } = usePlatformAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/platform/login" replace />;
  if (!platformStaff || platformStaff.status !== "active") {
    return <Navigate to="/platform/login" replace />;
  }

  return <>{children}</>;
}
