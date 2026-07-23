"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Star, X, Users, FileText, Wrench, MapPin, Building2 } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import type { DetailPanelKind } from "@/lib/rdash/store/ui-types";

/**
 * FavoritesBar — a compact horizontal bar showing the user's pinned/favorite
 * records for quick access. Stored in localStorage (per-device).
 *
 * Features:
 * - Pin any record from the detail panel (star button)
 * - Click a favorite to open it in the detail panel
 * - Remove favorites (x button on hover)
 * - Color-coded icons by entity type
 * - Persists across sessions (localStorage)
 * - Shows above the module content area
 * - Empty state: "Pin records for quick access"
 */

interface FavoriteItem {
  id: string;
  kind: DetailPanelKind;
  label: string;
  addedAt: number;
}

const STORAGE_KEY = "uc_favorites";

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  customer: Users,
  quotation: FileText,
  workOrder: Wrench,
  site: MapPin,
  task: Star,
  visit: MapPin,
};

const KIND_COLOR: Record<string, string> = {
  customer: "text-primary bg-primary/10 border-primary/20",
  quotation: "text-success bg-success/10 border-success/20",
  workOrder: "text-warning bg-warning/10 border-warning/20",
  site: "text-primary bg-primary/10 border-primary/20",
  task: "text-muted-foreground bg-muted/40 border-border",
  visit: "text-primary bg-primary/10 border-primary/20",
};

export function FavoritesBar() {
  const [favorites, setFavorites] = React.useState<FavoriteItem[]>([]);
  const openDetail = useRDashStore((s) => s.openDetail);

  // Load from localStorage on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch { /* non-fatal */ }
  }, []);

  // Save to localStorage when favorites change
  const saveFavorites = React.useCallback((items: FavoriteItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch { /* non-fatal */ }
  }, []);

  const removeFavorite = (id: string) => {
    const next = favorites.filter((f) => f.id !== id);
    setFavorites(next);
    saveFavorites(next);
  };

  if (favorites.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-border/50 bg-card/60 p-1.5 backdrop-blur-sm rd-scroll">
      <span className="flex shrink-0 items-center gap-1 px-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <Star className="h-3 w-3 fill-current text-warning" />
        Favorites
      </span>
      {favorites.map((fav) => {
        const kindKey = (fav.kind || "task") as string;
        const Icon = KIND_ICON[kindKey] || Star;
        const colorClass = KIND_COLOR[kindKey] || KIND_COLOR.task;
        return (
          <div
            key={fav.id}
            className="group flex shrink-0 items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs transition-all hover:shadow-sm"
          >
            <button
              type="button"
              onClick={() => openDetail(fav.kind, fav.id)}
              className="flex items-center gap-1.5"
              title={`Open ${fav.label}`}
            >
              <span className={cn("flex h-5 w-5 items-center justify-center rounded", colorClass)}>
                <Icon className="h-3 w-3" />
              </span>
              <span className="max-w-32 truncate font-medium">{fav.label}</span>
            </button>
            <button
              type="button"
              onClick={() => removeFavorite(fav.id)}
              className="ml-0.5 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove ${fav.label} from favorites`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * useFavorites — a hook for adding/removing favorites from any component.
 * Used by the DetailPanel to add a "pin to favorites" star button.
 */
export function useFavorites() {
  const [favorites, setFavorites] = React.useState<FavoriteItem[]>([]);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch { /* non-fatal */ }
  }, []);

  const toggleFavorite = React.useCallback((item: Omit<FavoriteItem, "addedAt">) => {
    setFavorites((prev) => {
      const exists = prev.find((f) => f.id === item.id);
      let next: FavoriteItem[];
      if (exists) {
        next = prev.filter((f) => f.id !== item.id);
      } else {
        next = [...prev, { ...item, addedAt: Date.now() }].slice(-12); // max 12 favorites
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* non-fatal */ }
      return next;
    });
  }, []);

  const isFavorite = React.useCallback((id: string) => {
    return favorites.some((f) => f.id === id);
  }, [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}
