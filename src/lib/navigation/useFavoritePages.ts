// src/lib/navigation/useFavoritePages.ts
//
// Lets users pin NavItems as favorites, persisted in localStorage.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "rdpro.nav.favoritePages";

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export function useFavoritePages() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavorites());

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id];
      writeFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favoriteIds.includes(id), [favoriteIds]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFavoriteIds(readFavorites());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { favoriteIds, isFavorite, toggleFavorite };
}
