"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Star, X, Users, FileText, Wrench, MapPin } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import type { DetailPanelKind } from "@/lib/rdash/store/ui-types";

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

const KIND_ICON_STYLE: Record<string, string> = {
  customer: "text-primary",
  quotation: "text-success",
  workOrder: "text-warning",
  site: "text-primary",
  task: "text-muted-foreground",
  visit: "text-primary",
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
    <section aria-label="Favorites" className="flex min-w-0 items-center gap-2 border-b border-border/40 py-2">
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Star className="h-3 w-3 fill-warning text-warning" />
        Favorites
      </span>
      <div className="rd-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5">
        {favorites.map((fav) => {
          const kindKey = (fav.kind || "task") as string;
          const Icon = KIND_ICON[kindKey] || Star;
          const iconClass = KIND_ICON_STYLE[kindKey] || KIND_ICON_STYLE.task;
          return (
            <div
              key={favoriteKey(fav)}
              className="group flex h-8 shrink-0 items-center rounded-full border border-border/70 bg-card pl-2 pr-1 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-accent/50"
            >
              <button
                type="button"
                onClick={() => openDetail(fav.kind, fav.id)}
                className="flex min-w-0 items-center gap-1.5 pr-1.5 text-xs font-medium"
                title={`Open ${fav.label}`}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClass)} />
                <span className="max-w-36 truncate">{fav.label}</span>
              </button>
              <button
                type="button"
                onClick={() => removeFavorite(fav)}
                className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground/50 opacity-60 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={`Remove ${fav.label} from favorites`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
