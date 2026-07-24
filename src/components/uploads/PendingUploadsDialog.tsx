"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PendingUploadsPanel } from "./PendingUploadsPanel";

export function PendingUploadsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Files & Storage · Pending Uploads</DialogTitle>
          <DialogDescription>Durable uploads saved on this device, including files waiting for connectivity, retry, verification, or final registration.</DialogDescription>
        </DialogHeader>
        <PendingUploadsPanel />
      </DialogContent>
    </Dialog>
  );
}
