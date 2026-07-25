"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PendingUploadsPanel } from "./PendingUploadsPanel";
import { PendingChangesPanel } from "./PendingChangesPanel";

export function PendingUploadsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Background Activity</DialogTitle>
          <DialogDescription>Files and business changes saved on this device continue independently of their original dialog.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          <PendingChangesPanel />
          <PendingUploadsPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
