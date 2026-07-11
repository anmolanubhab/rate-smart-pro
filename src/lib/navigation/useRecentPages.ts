// src/lib/navigation/useRecentPages.ts
//
// Tracks recently visited NavItem ids in localStorage (per browser, capped
// at MAX_RECENTS, most-recent-first, de-duplicated).

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "rdpro.nav.recentPages";
const MAX_RECENTS = 8;

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore quota/availability errors
  }
}

export function useRecentPages() {
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecents());

  const recordVisit = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((existing) => existing !== id)].slice(0, MAX_RECENTS);
      writeRecents(next);
      return next;
    });
  }, []);

  // Keep in sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRecentIds(readRecents());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { recentIds, recordVisit };
}
