import { ReactNode, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import rdProLogo from "/rdpro-logo.png";

export default function OfflinePage({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-sm p-6">
        <div className="flex items-center gap-3">
          <img src={rdProLogo} alt="RD Pro" className="h-10 w-10 object-contain" />
          <div className="flex-1">
            <div className="text-lg font-semibold leading-tight">RD Pro</div>
            <div className="text-sm text-muted-foreground">You’re offline</div>
          </div>
          <WifiOff className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="mt-5 text-sm text-muted-foreground">
          Please check your internet connection and try again.
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Button onClick={() => window.location.reload()} className="flex-1">
            Retry
          </Button>
          <Button variant="outline" onClick={() => setOnline(navigator.onLine)} className="flex-1">
            I’m back online
          </Button>
        </div>
      </div>
    </div>
  );
}

