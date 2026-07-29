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

const MAX_VARIATION_AMOUNT = 1_000_000_000;
const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 4_000;
const TERMINAL_WORK_ORDER_STATUSES = new Set([
  "cancelled",
  "canceled",
  "abandoned",
  "closed",
]);

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function parseAmount(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isSafeInteger(Math.round(amount * 100))) return null;
  if (amount <= 0 || amount > MAX_VARIATION_AMOUNT) return null;
  return Math.round(amount * 100) / 100;
}

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
  const [submitting, setSubmitting] = React.useState(false);

  const fixedWorkOrderId = String(workOrderId || "").trim();

  React.useEffect(() => {
    if (!open) return;
    setSelectedWorkOrderId(fixedWorkOrderId);
    setTitle(String(defaultTitle || "").slice(0, MAX_TITLE_LENGTH));
    setDescription(String(defaultDescription || "").slice(0, MAX_DESCRIPTION_LENGTH));
    setAmount("");
    setSubmitting(false);
  }, [defaultDescription, defaultTitle, fixedWorkOrderId, open]);

  const availableWorkOrders = db.workOrders.filter(
    (row) => !TERMINAL_WORK_ORDER_STATUSES.has(normalizeStatus(row.status)),
  );
  const targetWorkOrderId = fixedWorkOrderId || selectedWorkOrderId.trim();
  const selectedWorkOrder = db.workOrders.find(
    (row) => row.id === targetWorkOrderId,
  );
  const selectedExecutionLog = executionLogId
    ? db.executionLogs.find((row) => row.id === executionLogId)
    : undefined;

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (submitting) return;

    const requestedAmount = parseAmount(amount);
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    if (!targetWorkOrderId || !selectedWorkOrder) {
      toast.error("Choose a valid Work Order");
      return;
    }
    if (TERMINAL_WORK_ORDER_STATUSES.has(normalizeStatus(selectedWorkOrder.status))) {
      toast.error("Variations cannot be raised against a closed or cancelled Work Order");
      return;
    }
    if (executionLogId && (!selectedExecutionLog || selectedExecutionLog.work_order_id !== targetWorkOrderId)) {
      toast.error("The execution log does not belong to the selected Work Order");
      return;
    }
    if (!normalizedDescription) {
      toast.error("Describe the scope or cost change");
      return;
    }
    if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
      toast.error(`Scope change must be ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters or fewer`);
      return;
    }
    if (normalizedTitle.length > MAX_TITLE_LENGTH) {
      toast.error(`Title must be ${MAX_TITLE_LENGTH} characters or fewer`);
      return;
    }
    if (requestedAmount === null) {
      toast.error("Enter a valid variation amount with no more than two decimal places");
      return;
    }

    setSubmitting(true);
    try {
      const id = createVariationRequest({
        work_order_id: targetWorkOrderId,
        execution_log_id: executionLogId,
        title: normalizedTitle || undefined,
        description: normalizedDescription,
        requested_amount: requestedAmount,
      });
      toast.success("Variation raised for customer approval");
      onCreated?.(id);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Variation could not be created",
      );
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit}>
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

          <div className="space-y-4 py-4">
            {!fixedWorkOrderId ? (
              <div className="space-y-1.5">
                <label htmlFor="variation-work-order" className="text-xs font-semibold">Work Order</label>
                <select
                  id="variation-work-order"
                  value={selectedWorkOrderId}
                  onChange={(event) => setSelectedWorkOrderId(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={submitting}
                  required
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
                  {selectedWorkOrder?.work_order_no || "Invalid Work Order"}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {selectedWorkOrder?.title || "The linked Work Order could not be found."}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="variation-title" className="text-xs font-semibold">Title</label>
              <Input
                id="variation-title"
                value={title}
                onChange={(event) => setTitle(event.target.value.slice(0, MAX_TITLE_LENGTH))}
                placeholder="e.g. Additional false-ceiling work"
                maxLength={MAX_TITLE_LENGTH}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="variation-description" className="text-xs font-semibold">Scope change</label>
              <Textarea
                id="variation-description"
                value={description}
                onChange={(event) => setDescription(event.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                placeholder="Describe what changed, why it was not in the approved scope, and what is required."
                className="min-h-28"
                maxLength={MAX_DESCRIPTION_LENGTH}
                disabled={submitting}
                required
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {description.length.toLocaleString()} / {MAX_DESCRIPTION_LENGTH.toLocaleString()}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="variation-amount" className="text-xs font-semibold">Requested amount</label>
              <div className="relative">
                <IndianRupee className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="variation-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0.00"
                  className="pl-9"
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !selectedWorkOrder}>
              <GitPullRequest className="mr-1.5 h-3.5 w-3.5" />
              {submitting ? "Raising…" : "Raise variation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
