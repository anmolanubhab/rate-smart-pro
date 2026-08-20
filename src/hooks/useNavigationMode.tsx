// src/hooks/useNavigationMode.tsx
//
// Toggles the sidebar between Gateway Mode (Tally-style drill-down, new
// default) and Classic Tree (the pre-existing always-expanded module tree,
// fallback). Modeled 1:1 on useTheme.tsx — the only other real, working
// user-preference toggle in the app (localStorage + Context, no DB table).
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type NavMode = "gateway" | "classic";
const NavigationModeContext = createContext<{ mode: NavMode; toggle: () => void } | undefined>(undefined);

export const NavigationModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<NavMode>(() => {
    if (typeof window === "undefined") return "gateway";
    const stored = localStorage.getItem("rdpro.nav.mode") as NavMode | null;
    return stored === "classic" ? "classic" : "gateway";
  });

  useEffect(() => {
    localStorage.setItem("rdpro.nav.mode", mode);
  }, [mode]);

  return (
    <NavigationModeContext.Provider
      value={{ mode, toggle: () => setMode((m) => (m === "gateway" ? "classic" : "gateway")) }}
    >
      {children}
    </NavigationModeContext.Provider>
  );
};

export const useNavigationMode = () => {
  const ctx = useContext(NavigationModeContext);
  if (!ctx) throw new Error("useNavigationMode must be used within NavigationModeProvider");
  return ctx;
};
