"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRDashStore } from "@/lib/rdash/store";
import type { Site } from "@/lib/rdash/types";
import { emptyWorkRequiredFormDraft, WorkRequiredFields, type WorkRequiredFormDraft } from "./WorkRequiredFields";

interface WorkRequiredCreateDialogProps {
  open: boolean;
  customerId: string;
  site: Site;
  initialAreaIds?: string[];
  onOpenChange: (open: boolean) => void;
  onCreated?: (workRequiredId: string) => void;
}

export function WorkRequiredCreateDialog({ open, customerId, site, initialAreaIds, onOpenChange, onCreated }: WorkRequiredCreateDialogProps) {
  const db = useRDashStore((state) => state.db);
  const addArea = useRDashStore((state) => state.addArea);
  const addWorkRequired = useRDashStore((state) => state.addWorkRequired);
  const siteAreas = React.useMemo(() => db.areas.filter((area) => area.site_id === site.id && !area.is_archived), [db.areas, site.id]);
  const [draft, setDraft] = React.useState<WorkRequiredFormDraft>(() => emptyWorkRequiredFormDraft());
  const initializedDialogKey = React.useRef("");
  const initialAreaIdsKey = (initialAreaIds || []).join("|");

  React.useEffect(() => {
    if (!open) {
      initializedDialogKey.current = "";
      return;
    }
    const dialogKey = `${site.id}|${initialAreaIdsKey}`;
    if (initializedDialogKey.current === dialogKey) return;
    initializedDialogKey.current = dialogKey;
    setDraft({
      ...emptyWorkRequiredFormDraft(),
      areaIds: (initialAreaIdsKey ? initialAreaIdsKey.split("|") : []).filter((id) => siteAreas.some((area) => area.id === id)),
    });
  }, [initialAreaIdsKey, open, site.id, siteAreas]);

  const save = () => {
    if (!draft.categoryId) return toast.error("Select the primary Work Category.");
    if (!draft.subcategoryIds.length) return toast.error("Select at least one Work Subcategory.");
    if (!draft.title.trim()) return toast.error("Work Required title is required.");
    if (!draft.areaIds.length) return toast.error("Select at least one covered Area.");
    try {
      const id = addWorkRequired({
        customer_id: customerId,
        site_id: site.id,
        title: draft.title.trim(),
        work_category_id: draft.categoryId,
        work_subcategory_ids: draft.subcategoryIds,
        area_ids: draft.areaIds,
        description: draft.description.trim() || undefined,
        status: "new",
        priority: draft.priority,
      });
      toast.success(`Work Required created for ${site.name}`);
      onCreated?.(id);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Work Required could not be created.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" />Add Work Required</DialogTitle>
          <DialogDescription>{site.name} · the work, areas, quotation, and execution remain linked to this Customer Site.</DialogDescription>
        </DialogHeader>
        <WorkRequiredFields
          db={db}
          site={site}
          areas={siteAreas}
          value={draft}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onCreateArea={({ name, areaType, notes }) => addArea({ site_id: site.id, name, area_type: areaType, notes: notes || undefined, stage: "unmeasured" })}
        />
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save}><Plus className="mr-1 h-3.5 w-3.5" />Create Work Required</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
