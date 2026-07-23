"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore, type SavedView } from "@/lib/rdash/store";
import type { FilterPreset } from "@/lib/rdash/modules";
import { Bookmark, BookmarkPlus, X, Check, Pencil, Star } from "lucide-react";
import { toast } from "sonner";
import { loadSavedViews, SAVED_VIEWS_STORAGE_KEY } from "@/lib/rdash/saved-views-storage";
export interface SavedViewsBarProps {
    workspaceKey: string;
    presets?: FilterPreset[] | null;
    currentPresetId?: string;
    currentSearch: string;
    currentExtra?: Record<string, string>;
    onApply: (view: SavedView) => void;
    activeSavedViewId?: string | null;
    className?: string;
}
export function SavedViewsBar({ workspaceKey, presets, currentPresetId, currentSearch, currentExtra, onApply, activeSavedViewId, className, }: SavedViewsBarProps) {
    const savedViews = useRDashStore((s) => s.savedViews);
    const addSavedView = useRDashStore((s) => s.addSavedView);
    const deleteSavedView = useRDashStore((s) => s.deleteSavedView);
    const renameSavedView = useRDashStore((s) => s.renameSavedView);
    const [naming, setNaming] = React.useState(false);
    const [draftName, setDraftName] = React.useState("");
    const [renamingId, setRenamingId] = React.useState<string | null>(null);
    const [renameDraft, setRenameDraft] = React.useState("");
    const nameInputRef = React.useRef<HTMLInputElement>(null);
    const renameInputRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        const syncSavedViews = () => useRDashStore.setState({ savedViews: loadSavedViews() });
        syncSavedViews();
        const onStorage = (event: StorageEvent) => {
            if (event.key === SAVED_VIEWS_STORAGE_KEY) syncSavedViews();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);
    const myViews = savedViews.filter((v) => v.workspaceKey === workspaceKey);
    React.useEffect(() => {
        if (naming) {
            nameInputRef.current?.focus();
        }
    }, [naming]);
    React.useEffect(() => {
        if (renamingId) {
            renameInputRef.current?.focus();
        }
    }, [renamingId]);
    const suggestedName = React.useMemo(() => {
        const presetLabel = presets?.find((p) => p.id === currentPresetId)?.label;
        const parts: string[] = [];
        if (presetLabel)
            parts.push(presetLabel);
        if (currentSearch.trim())
            parts.push(`"${currentSearch.trim()}"`);
        return parts.length ? parts.join(" · ") : "Current view";
    }, [presets, currentPresetId, currentSearch]);
    const handleSave = () => {
        const name = draftName.trim() || suggestedName;
        addSavedView({
            workspaceKey,
            label: name,
            presetId: currentPresetId,
            search: currentSearch,
            extra: currentExtra || {},
        });
        toast.success(`Saved view "${name}"`);
        setNaming(false);
        setDraftName("");
    };
    const handleCancelSave = () => {
        setNaming(false);
        setDraftName("");
    };
    const handleApply = (view: SavedView) => {
        onApply(view);
        toast.info(`Applied view "${view.label}"`);
    };
    const handleDelete = (view: SavedView) => {
        deleteSavedView(view.id);
        toast.success(`Deleted view "${view.label}"`);
    };
    const handleStartRename = (view: SavedView) => {
        setRenamingId(view.id);
        setRenameDraft(view.label);
    };
    const handleCommitRename = () => {
        if (renamingId && renameDraft.trim()) {
            renameSavedView(renamingId, renameDraft.trim());
            toast.success("View renamed");
        }
        setRenamingId(null);
        setRenameDraft("");
    };
    const handleCancelRename = () => {
        setRenamingId(null);
        setRenameDraft("");
    };
    return (<div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {myViews.length > 0 && (<span className="flex items-center gap-1 pr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          <Bookmark className="h-3 w-3"/>
          Saved
        </span>)}
      {myViews.map((view) => {
            const isActive = view.id === activeSavedViewId;
            const isRenaming = renamingId === view.id;
            if (isRenaming) {
                return (<div key={view.id} className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-1.5 py-1">
              <input ref={renameInputRef} value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onKeyDown={(e) => {
                        if (e.key === "Enter")
                            handleCommitRename();
                        if (e.key === "Escape")
                            handleCancelRename();
                    }} className="h-6 w-32 rounded border border-input bg-card px-2 text-xs outline-none focus-visible:ring-2 ring-ring" placeholder="View name" aria-label="Rename saved view"/>
              <button type="button" onClick={handleCommitRename} className="flex h-6 w-6 items-center justify-center rounded text-success hover:bg-success/10" aria-label="Confirm rename">
                <Check className="h-3.5 w-3.5"/>
              </button>
              <button type="button" onClick={handleCancelRename} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent" aria-label="Cancel rename">
                <X className="h-3.5 w-3.5"/>
              </button>
            </div>);
            }
            return (<div key={view.id} className={cn("group flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all duration-150", isActive
                    ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                    : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-accent/40")}>
            <button type="button" onClick={() => handleApply(view)} className="flex items-center gap-1.5 outline-none" title={`Apply: ${view.label}${view.search ? ` · search "${view.search}"` : ""}`}>
              <Star className={cn("h-3 w-3 transition-colors", isActive ? "fill-primary text-primary" : "text-muted-foreground")}/>
              <span className="max-w-[160px] truncate">{view.label}</span>
            </button>
            <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button type="button" onClick={() => handleStartRename(view)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Rename ${view.label}`} title="Rename">
                <Pencil className="h-3 w-3"/>
              </button>
              <button type="button" onClick={() => handleDelete(view)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${view.label}`} title="Delete">
                <X className="h-3 w-3"/>
              </button>
            </span>
          </div>);
        })}
      {naming ? (<div className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/5 px-1.5 py-1">
          <BookmarkPlus className="h-3.5 w-3.5 text-primary"/>
          <input ref={nameInputRef} value={draftName} onChange={(e) => setDraftName(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter")
                    handleSave();
                if (e.key === "Escape")
                    handleCancelSave();
            }} placeholder={suggestedName} className="h-6 w-44 rounded border border-input bg-card px-2 text-xs outline-none focus-visible:ring-2 ring-ring" aria-label="Name this saved view"/>
          <button type="button" onClick={handleSave} className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90" aria-label="Save view">
            <Check className="h-3.5 w-3.5"/>
          </button>
          <button type="button" onClick={handleCancelSave} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent" aria-label="Cancel save">
            <X className="h-3.5 w-3.5"/>
          </button>
        </div>) : (<button type="button" onClick={() => setNaming(true)} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-transparent px-2 py-1 text-xs font-medium text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:bg-accent/40 hover:text-foreground" title="Save the current filter combination as a named view">
          <BookmarkPlus className="h-3.5 w-3.5"/>
          Save view
        </button>)}
      {myViews.length === 0 && !naming && (<span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
          <Bookmark className="h-3 w-3"/>
          Save a filter combo to recall it here
        </span>)}
    </div>);
}
