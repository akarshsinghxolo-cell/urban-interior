"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Task, Followup, Visit, WorkOrder } from "@/lib/rdash/types";

export type EditableEntityType = "task" | "followup" | "visit" | "workOrder";

interface EditDetailsDialogProps {
  type: EditableEntityType;
  entityId?: string;
  open: boolean;
  onClose: () => void;
}

export function EditDetailsDialog({ type, entityId, open, onClose }: EditDetailsDialogProps) {
  const db = useRDashStore((s) => s.db);
  const updateTask = useRDashStore((s) => s.updateTask);
  const updateFollowup = useRDashStore((s) => s.updateFollowup);
  const rescheduleVisit = useRDashStore((s) => s.rescheduleVisit);
  const updateJob = useRDashStore((s) => s.updateJob);

  const entity = React.useMemo(() => {
    if (!entityId) return null;
    if (type === "task") return db.tasks.find((t) => t.id === entityId) || null;
    if (type === "followup") return db.followups.find((f) => f.id === entityId) || null;
    if (type === "visit") return db.visits.find((v) => v.id === entityId) || null;
    if (type === "workOrder") return db.workOrders.find((w) => w.id === entityId) || null;
    return null;
  }, [entityId, type, db.tasks, db.followups, db.visits, db.workOrders]);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState("medium");
  const [dueDate, setDueDate] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [locationName, setLocationName] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [contractorId, setContractorId] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [expectedEnd, setExpectedEnd] = React.useState("");

  React.useEffect(() => {
    if (!open || !entity) return;
    if (type === "task") {
      const t = entity as Task;
      setTitle(t.title || "");
      setDescription(t.description || "");
      setPriority(t.priority || "medium");
      setDueDate(t.due_date || "");
      setAssigneeId(t.assignee_id || "");
      setStatus(t.status || "todo");
    } else if (type === "followup") {
      const f = entity as Followup;
      setTitle(f.title || "");
      setNotes(f.notes || "");
      setDueDate(f.due_date || "");
      setStatus(f.status || "pending");
      setAssigneeId(f.assigned_to || "");
    } else if (type === "visit") {
      const v = entity as Visit;
      setTitle(v.location_name || "");
      setLocationName(v.location_name || "");
      setScheduledAt(v.scheduled_at ? v.scheduled_at.slice(0, 16) : "");
      setAssigneeId(v.staff_id || "");
      setStatus(v.status || "scheduled");
    } else if (type === "workOrder") {
      const w = entity as WorkOrder;
      setTitle(w.title || "");
      setContractorId(w.contractor_id || "");
      setStartDate(w.start_date || "");
      setExpectedEnd(w.expected_end || "");
      setStatus(w.status || "in_progress");
    }
  }, [open, entityId, type]);  // STAGE-4-FIX: deps [open,entityId,type] (was [open,entity,type] — entity ref changes on every db mutation, resetting form)

  const staff = db.master.staff.filter((s) => s.status === "active");
  const contractors = db.master.contractors;

  const handleSave = () => {
    if (!entityId || !entity) return;
    try {
      if (type === "task") {
        const patch: Partial<Task> = {
          title: title.trim(),
          description: description.trim(),
          priority: priority as Task["priority"],
          due_date: dueDate,
        };
        if (assigneeId) {
          const s = staff.find((x) => x.id === assigneeId);
          patch.assignee_id = assigneeId;
          patch.assignee_name = s?.name || "";
          patch.assigned_to = s?.name || "";
        }
        updateTask(entityId, patch);
        toast.success("Task updated");
      } else if (type === "followup") {
        const patch: Partial<Followup> = {
          notes: notes.trim(),
          due_date: dueDate,
        };
        updateFollowup(entityId, patch);
        toast.success("Follow-up updated");
      } else if (type === "visit") {
        if (scheduledAt) {
          const iso = scheduledAt.length === 16 ? scheduledAt + ":00" : scheduledAt;
          rescheduleVisit(entityId, iso);
        }
        if (locationName.trim() && locationName !== (entity as Visit).location_name) {
          toast.info("Visit location name updated in thread. Use reschedule for full details.");
        }
        toast.success("Visit rescheduled");
      } else if (type === "workOrder") {
        const patch: Partial<WorkOrder> = {
          title: title.trim(),
        };
        if (contractorId) {
          const c = contractors.find((x) => x.id === contractorId);
          patch.contractor_id = contractorId;
          patch.contractor_name = c?.name || "";
        }
        if (startDate) patch.start_date = startDate;
        if (expectedEnd) patch.expected_end = expectedEnd;
        updateJob(entityId, patch);
        toast.success("Work Order updated");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save changes");
    }
  };

  if (!entity) return null;

  const titleMap: Record<EditableEntityType, string> = {
    task: "Edit Task",
    followup: "Edit Follow-up",
    visit: "Edit Visit",
    workOrder: "Edit Work Order",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            {titleMap[type]}
          </DialogTitle>
          <DialogDescription>
            Update the details below. Changes are saved immediately to the workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title / Name */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">{type === "visit" ? "Location name" : type === "followup" ? "Subject" : "Title"}</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter title" />
          </div>

          {/* Description (task only) */}
          {type === "task" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enter description" rows={3} />
            </div>
          )}

          {/* Notes (followup only) */}
          {type === "followup" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter notes" rows={3} />
            </div>
          )}

          {/* Priority (task only) */}
          {type === "task" && (
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Due date (task/followup) */}
          {(type === "task" || type === "followup") && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-due">Due date</Label>
              <Input id="edit-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          )}

          {/* Scheduled at (visit only) */}
          {type === "visit" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-scheduled">Scheduled date &amp; time</Label>
              <Input id="edit-scheduled" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
          )}

          {/* Assignee (task/visit) */}
          {(type === "task" || type === "visit") && staff.length > 0 && (
            <div className="space-y-1.5">
              <Label>Assigned staff</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Contractor (workOrder only) */}
          {type === "workOrder" && contractors.length > 0 && (
            <div className="space-y-1.5">
              <Label>Contractor</Label>
              <Select value={contractorId} onValueChange={setContractorId}>
                <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
                <SelectContent>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.trade})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Start/end dates (workOrder only) */}
          {type === "workOrder" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-start">Start date</Label>
                <Input id="edit-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end">Expected end</Label>
                <Input id="edit-end" type="date" value={expectedEnd} onChange={(e) => setExpectedEnd(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
