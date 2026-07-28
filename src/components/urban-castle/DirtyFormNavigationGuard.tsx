"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistrySnapshot } from "@/lib/rdash/use-dirty-form-guard";

export function DirtyFormNavigationGuard() {
  const snapshot = useDirtyFormRegistrySnapshot();
  const pending = snapshot.pendingNavigation;
  const resolving = snapshot.resolving;
  const formLabels = snapshot.dirtyForms.map((form) => form.label);
  const summary = formLabels.length <= 2
    ? formLabels.join(" and ")
    : `${formLabels.slice(0, 2).join(", ")} and ${formLabels.length - 2} more forms`;

  return (
    <AlertDialog
      open={Boolean(pending)}
      onOpenChange={(open) => {
        if (!open && !resolving) void dirtyFormRegistry.resolve("stay");
      }}
    >
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <div className="flex items-start gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning ring-1 ring-warning/20">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
              <AlertDialogDescription className="mt-1 leading-relaxed">
                {summary || "The current form"} has changes that have not been submitted to the workspace.
                {pending ? ` Choose what to do before you ${pending.reason}.` : ""}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {formLabels.length > 1 ? (
          <div className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
            {formLabels.map((label) => <div key={label}>• {label}</div>)}
          </div>
        ) : null}

        {snapshot.error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {snapshot.error}
          </div>
        ) : null}

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(resolving)}
            onClick={() => void dirtyFormRegistry.resolve("stay")}
          >
            Stay
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={Boolean(resolving)}
            onClick={() => void dirtyFormRegistry.resolve("discard")}
          >
            {resolving === "discard" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Discard changes
          </Button>
          <Button
            type="button"
            disabled={Boolean(resolving)}
            onClick={() => void dirtyFormRegistry.resolve("save")}
          >
            {resolving === "save" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
