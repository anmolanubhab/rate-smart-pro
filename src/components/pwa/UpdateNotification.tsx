import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

export default function UpdateNotification() {
  const shownRef = useRef(false);

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    immediate: true,
  });

  useEffect(() => {
    if (!needRefresh || shownRef.current) return;
    shownRef.current = true;

    toast("Update available", {
      description: "A new version of RD Pro is available.",
      action: {
        label: "Update now",
        onClick: () => updateServiceWorker(true),
      },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}

