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

const STORAGE_KEY = "uc_favorites_v2";
const LEGACY_STORAGE_KEY = "uc_favorites";
const FAVORITES_CHANGED_EVENT = "uc:favorites-changed";
const MAX_FAVORITES = 12;

function favoriteKey(item: Pick<FavoriteItem, "id" | "kind">): string {
  return `${item.kind || "unknown"}:${item.id}`;
}

function isFavoriteItem(value: unknown): value is FavoriteItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FavoriteItem>;
  return typeof item.id === "string" && typeof item.label === "string" &&
    typeof item.addedAt === "number" && typeof item.kind === "string";
}

function readFavorites(): FavoriteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isFavoriteItem).slice(-MAX_FAVORITES) : [];
  } catch {
    return [];
  }
}

function writeFavorites(items: readonly FavoriteItem[]): void {
  const next = items.slice(-MAX_FAVORITES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
  } catch {
    // Favorites are a non-critical device preference.
  }
}

function useFavoriteItems() {
  const [favorites, setFavorites] = React.useState<FavoriteItem[]>([]);
  React.useEffect(() => {
    const sync = () => setFavorites(readFavorites());
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
    };
  }, []);
  const updateFavorites = React.useCallback((update: (current: FavoriteItem[]) => FavoriteItem[]) => {
    const next = update(readFavorites()).slice(-MAX_FAVORITES);
    writeFavorites(next);
    setFavorites(next);
  }, []);
  return [favorites, updateFavorites] as const;
}

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
  const [favorites, updateFavorites] = useFavoriteItems();
  const openDetail = useRDashStore((s) => s.openDetail);

  const removeFavorite = (target: FavoriteItem) => {
    const targetKey = favoriteKey(target);
    updateFavorites((current) => current.filter((favorite) => favoriteKey(favorite) !== targetKey));
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
            key={favoriteKey(fav)}
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
              onClick={() => removeFavorite(fav)}
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
  const [favorites, updateFavorites] = useFavoriteItems();

  const toggleFavorite = React.useCallback((item: Omit<FavoriteItem, "addedAt">) => {
    const targetKey = favoriteKey(item);
    updateFavorites((current) => {
      const exists = current.some((favorite) => favoriteKey(favorite) === targetKey);
      if (exists) return current.filter((favorite) => favoriteKey(favorite) !== targetKey);
      return [...current, { ...item, addedAt: Date.now() }];
    });
  }, [updateFavorites]);

  const isFavorite = React.useCallback((id: string, kind?: DetailPanelKind) => {
    return favorites.some((favorite) => favorite.id === id && (!kind || favorite.kind === kind));
  }, [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}
