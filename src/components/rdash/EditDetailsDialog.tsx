"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
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

type EditableEntity = Task | Followup | Visit | WorkOrder;

interface EditDetailsDialogProps {
  type: EditableEntityType;
  entityId?: string;
  open: boolean;
  onClose: () => void;
}

interface EditFormValues {
  title: string;
  description: string;
  priority: string;
  dueDate: string;
  assigneeId: string;
  status: string;
  notes: string;
  locationName: string;
  scheduledAt: string;
  contractorId: string;
  startDate: string;
  expectedEnd: string;
}

const EMPTY_EDIT_FORM: EditFormValues = {
  title: "",
  description: "",
  priority: "medium",
  dueDate: "",
  assigneeId: "",
  status: "",
  notes: "",
  locationName: "",
  scheduledAt: "",
  contractorId: "",
  startDate: "",
  expectedEnd: "",
};

const TITLE_MAP: Record<EditableEntityType, string> = {
  task: "Edit Task",
  followup: "Edit Follow-up",
  visit: "Edit Visit",
  workOrder: "Edit Work Order",
};

function formValuesForEntity(type: EditableEntityType, entity: EditableEntity): EditFormValues {
  const values = { ...EMPTY_EDIT_FORM };
  if (type === "task") {
    const task = entity as Task;
    return {
      ...values,
      title: task.title || "",
      description: task.description || "",
      priority: task.priority || "medium",
      dueDate: task.due_date || "",
      assigneeId: task.assignee_id || "",
      status: task.status || "todo",
    };
  }
  if (type === "followup") {
    const followup = entity as Followup;
    return {
      ...values,
      title: followup.title || "",
      notes: followup.notes || "",
      dueDate: followup.due_date || "",
      status: followup.status || "pending",
      assigneeId: followup.assigned_to || "",
    };
  }
  if (type === "visit") {
    const visit = entity as Visit;
    return {
      ...values,
      title: visit.location_name || "",
      locationName: visit.location_name || "",
      scheduledAt: visit.scheduled_at ? visit.scheduled_at.slice(0, 16) : "",
      assigneeId: visit.staff_id || "",
      status: visit.status || "scheduled",
    };
  }
  const workOrder = entity as WorkOrder;
  return {
    ...values,
    title: workOrder.title || "",
    contractorId: workOrder.contractor_id || "",
    startDate: workOrder.start_date || "",
    expectedEnd: workOrder.expected_end || "",
    status: workOrder.status || "in_progress",
  };
}

function formFingerprint(type: EditableEntityType, values: EditFormValues): string {
  if (type === "task") {
    return JSON.stringify([
      values.title,
      values.description,
      values.priority,
      values.dueDate,
      values.assigneeId,
    ]);
  }
  if (type === "followup") {
    return JSON.stringify([values.title, values.notes, values.dueDate]);
  }
  if (type === "visit") {
    return JSON.stringify([values.scheduledAt, values.assigneeId]);
  }
  return JSON.stringify([
    values.title,
    values.contractorId,
    values.startDate,
    values.expectedEnd,
  ]);
}

export function EditDetailsDialog({ type, entityId, open, onClose }: EditDetailsDialogProps) {
  const db = useRDashStore((s) => s.db);
  const updateTask = useRDashStore((s) => s.updateTask);
  const updateFollowup = useRDashStore((s) => s.updateFollowup);
  const reassignVisit = useRDashStore((s) => s.reassignVisit);
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
  const baselineRef = React.useRef<EditFormValues>({ ...EMPTY_EDIT_FORM });
  const formId = `edit-details:${type}:${entityId || "unknown"}`;

  const currentValues = React.useMemo<EditFormValues>(() => ({
    title,
    description,
    priority,
    dueDate,
    assigneeId,
    status,
    notes,
    locationName,
    scheduledAt,
    contractorId,
    startDate,
    expectedEnd,
  }), [
    title,
    description,
    priority,
    dueDate,
    assigneeId,
    status,
    notes,
    locationName,
    scheduledAt,
    contractorId,
    startDate,
    expectedEnd,
  ]);

  const applyValues = React.useCallback((values: EditFormValues) => {
    setTitle(values.title);
    setDescription(values.description);
    setPriority(values.priority);
    setDueDate(values.dueDate);
    setAssigneeId(values.assigneeId);
    setStatus(values.status);
    setNotes(values.notes);
    setLocationName(values.locationName);
    setScheduledAt(values.scheduledAt);
    setContractorId(values.contractorId);
    setStartDate(values.startDate);
    setExpectedEnd(values.expectedEnd);
  }, []);

  const staff = db.master.staff.filter((member) => member.status === "active");
  const contractors = db.master.contractors;

  const persistChanges = React.useCallback((): boolean => {
    if (!entityId || !entity) return false;
    try {
      if (type === "task") {
        const patch: Partial<Task> = {
          title: title.trim(),
          description: description.trim(),
          priority: priority as Task["priority"],
          due_date: dueDate,
        };
        if (assigneeId) {
          const member = staff.find((entry) => entry.id === assigneeId);
          patch.assignee_id = assigneeId;
          patch.assignee_name = member?.name || "";
          patch.assigned_to = member?.name || "";
        }
        updateTask(entityId, patch);
        toast.success("Task updated");
      } else if (type === "followup") {
        const patch: Partial<Followup> = {
          title: title.trim(),
          notes: notes.trim(),
          due_date: dueDate,
        };
        updateFollowup(entityId, patch);
        toast.success("Follow-up updated");
      } else if (type === "visit") {
        const visit = entity as Visit;
        if (scheduledAt) {
          const iso = scheduledAt.length === 16 ? scheduledAt + ":00" : scheduledAt;
          rescheduleVisit(entityId, iso);
        }
        if (assigneeId && assigneeId !== visit.staff_id) {
          reassignVisit(entityId, { type: "staff", id: assigneeId });
        }
        if (locationName.trim() && locationName !== visit.location_name) {
          toast.info("Visit location is linked to its Site or Vendor and was not changed here.");
        }
        toast.success("Visit updated");
      } else if (type === "workOrder") {
        const patch: Partial<WorkOrder> = {
          title: title.trim(),
        };
        if (contractorId) {
          const contractor = contractors.find((entry) => entry.id === contractorId);
          patch.contractor_id = contractorId;
          patch.contractor_name = contractor?.name || "";
        }
        if (startDate) patch.start_date = startDate;
        if (expectedEnd) patch.expected_end = expectedEnd;
        updateJob(entityId, patch);
        toast.success("Work Order updated");
      }
      baselineRef.current = currentValues;
      dirtyFormRegistry.markClean(formId);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save changes");
      return false;
    }
  }, [
    assigneeId,
    contractorId,
    contractors,
    currentValues,
    description,
    dueDate,
    entity,
    entityId,
    expectedEnd,
    formId,
    locationName,
    notes,
    priority,
    reassignVisit,
    rescheduleVisit,
    scheduledAt,
    staff,
    startDate,
    title,
    type,
    updateFollowup,
    updateJob,
    updateTask,
  ]);

  const dirty = open && Boolean(entity) &&
    formFingerprint(type, currentValues) !== formFingerprint(type, baselineRef.current);

  useDirtyFormRegistration({
    id: formId,
    label: TITLE_MAP[type],
    dirty,
    save: persistChanges,
    discard: () => {
      applyValues(baselineRef.current);
      return true;
    },
  });

  React.useEffect(() => {
    if (!open || !entity) return;
    const values = formValuesForEntity(type, entity as EditableEntity);
    baselineRef.current = values;
    applyValues(values);
    dirtyFormRegistry.markClean(formId);
  }, [open, entityId, type, applyValues, formId]);
  // `entity` is intentionally omitted: its reference changes on every database
  // mutation and would otherwise reset an in-progress edit form.

  const handleSave = () => {
    if (persistChanges()) onClose();
  };

  if (!entity) return null;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            {TITLE_MAP[type]}
          </DialogTitle>
          <DialogDescription>
            Update the details below. Changes are saved immediately to the workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">{type === "visit" ? "Location name" : type === "followup" ? "Subject" : "Title"}</Label>
            <Input
              id="edit-title"
              value={type === "visit" ? locationName : title}
              onChange={(event) => type === "visit" ? setLocationName(event.target.value) : setTitle(event.target.value)}
              placeholder="Enter title"
              readOnly={type === "visit"}
            />
          </div>

          {type === "task" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea id="edit-desc" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter description" rows={3} />
            </div>
          )}

          {type === "followup" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea id="edit-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Enter notes" rows={3} />
            </div>
          )}

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

          {(type === "task" || type === "followup") && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-due">Due date</Label>
              <Input id="edit-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
          )}

          {type === "visit" && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-scheduled">Scheduled date &amp; time</Label>
              <Input id="edit-scheduled" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
            </div>
          )}

          {(type === "task" || type === "visit") && staff.length > 0 && (
            <div className="space-y-1.5">
              <Label>Assigned staff</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>{member.name} ({member.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "workOrder" && contractors.length > 0 && (
            <div className="space-y-1.5">
              <Label>Contractor</Label>
              <Select value={contractorId} onValueChange={setContractorId}>
                <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
                <SelectContent>
                  {contractors.map((contractor) => (
                    <SelectItem key={contractor.id} value={contractor.id}>{contractor.name} ({contractor.trade})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "workOrder" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-start">Start date</Label>
                <Input id="edit-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end">Expected end</Label>
                <Input id="edit-end" type="date" value={expectedEnd} onChange={(event) => setExpectedEnd(event.target.value)} />
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
