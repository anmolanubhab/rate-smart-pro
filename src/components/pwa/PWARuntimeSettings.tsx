import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import InstallButton from "@/components/pwa/InstallButton";

export default function PWARuntimeSettings() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as any)?.standalone;
  }, []);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>PWA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">App version</div>
          <Badge variant="secondary">{__APP_VERSION__}</Badge>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">Network</div>
          <Badge variant={online ? "default" : "destructive"}>{online ? "Online" : "Offline"}</Badge>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">Install status</div>
          <Badge variant={isStandalone ? "default" : "secondary"}>{isStandalone ? "Installed" : "Browser"}</Badge>
        </div>
        <div className="flex items-center justify-end">
          <InstallButton size="sm" />
        </div>
      </CardContent>
    </Card>
  );
}

