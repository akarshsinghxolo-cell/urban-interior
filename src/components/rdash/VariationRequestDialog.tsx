"use client";

import * as React from "react";
import { GitPullRequest, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRDashStore } from "@/lib/rdash/store";

export function VariationRequestDialog({
  open,
  workOrderId,
  executionLogId,
  defaultTitle,
  defaultDescription,
  onClose,
  onCreated,
}: {
  open: boolean;
  workOrderId?: string;
  executionLogId?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const db = useRDashStore((state) => state.db);
  const createVariationRequest = useRDashStore(
    (state) => state.createVariationRequest,
  );
  const [selectedWorkOrderId, setSelectedWorkOrderId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setSelectedWorkOrderId(workOrderId || "");
    setTitle(defaultTitle || "");
    setDescription(defaultDescription || "");
    setAmount("");
  }, [defaultDescription, defaultTitle, open, workOrderId]);

  const availableWorkOrders = db.workOrders.filter(
    (row) => row.status !== "cancelled" && row.status !== "abandoned",
  );
  const selectedWorkOrder = db.workOrders.find(
    (row) => row.id === (workOrderId || selectedWorkOrderId),
  );

  const submit = () => {
    const targetWorkOrderId = workOrderId || selectedWorkOrderId;
    const requestedAmount = Number(amount);
    if (!targetWorkOrderId) {
      toast.error("Choose a Work Order");
      return;
    }
    if (!description.trim()) {
      toast.error("Describe the scope or cost change");
      return;
    }
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      toast.error("Enter a variation amount greater than zero");
      return;
    }

    try {
      const id = createVariationRequest({
        work_order_id: targetWorkOrderId,
        execution_log_id: executionLogId,
        title: title.trim() || undefined,
        description: description.trim(),
        requested_amount: requestedAmount,
      });
      toast.success("Variation raised for customer approval");
      onCreated?.(id);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Variation could not be created",
      );
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 text-primary" />
            Raise variation
          </DialogTitle>
          <DialogDescription>
            Record an extra-scope or cost change. The request enters customer
            approval and is posted into the Work Order thread.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {!workOrderId ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Work Order</label>
              <select
                value={selectedWorkOrderId}
                onChange={(event) => setSelectedWorkOrderId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select Work Order</option>
                {availableWorkOrders.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.work_order_no} · {row.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
              <p className="font-semibold">
                {selectedWorkOrder?.work_order_no || "Work Order"}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {selectedWorkOrder?.title || "Selected execution scope"}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Title</label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Additional false-ceiling work"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Scope change</label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what changed, why it was not in the approved scope, and what is required."
              className="min-h-28"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Requested amount</label>
            <div className="relative">
              <IndianRupee className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <GitPullRequest className="mr-1.5 h-3.5 w-3.5" />
            Raise variation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
