"use client";

import * as React from "react";
import { CheckCircle2, Clock3, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetricCard, StatusBadge, EmptyState } from "../primitives";
import { relativeDay } from "@/lib/rdash/format";
import { useRDashStore } from "@/lib/rdash/store";

const ROLE_OPTIONS = [
  ["OWNER", "Owner"],
  ["OPERATIONS_MANAGER", "Operations Manager"],
  ["FIELD_STAFF", "Field Staff"],
  ["SALES_TELECALLER", "Sales / Telecaller"],
  ["PROCUREMENT_STAFF", "Procurement Staff"],
  ["FINANCE", "Finance"],
  ["ACCOUNTS_ADMIN", "Accounts / Admin"],
] as const;

type ApprovalStatus = "pending" | "active" | "rejected" | "inactive";

interface RDashUserRow {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  staff_id: string | null;
  display_name: string | null;
  status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}

function statusClass(status: ApprovalStatus) {
  if (status === "active") return "bg-success/10 text-success border-success/20";
  if (status === "pending") return "bg-warning/10 text-warning border-warning/20";
  if (status === "rejected") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
}

function roleLabel(role: string) {
  return ROLE_OPTIONS.find(([value]) => value === role)?.[1] || role.replaceAll("_", " ");
}

export function UserApprovalsModule() {
  const authUser = useRDashStore((state) => state.authUser);
  const [users, setUsers] = React.useState<RDashUserRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const loadUsers = React.useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/users", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { users?: RDashUserRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load user approvals.");
      setUsers(payload.users || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load user approvals.");
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function updateUser(input: { id: string; action: "approve" | "reject"; role?: string; displayName?: string; staffId?: string }) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => ({})) as { user?: RDashUserRow; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "Could not update user approval.");
      setUsers((rows) => rows.map((row) => row.id === payload.user!.id ? payload.user! : row));
      toast.success(input.action === "approve" ? "User approved" : "User rejected");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not update user approval.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const pending = users.filter((user) => user.status === "pending");
  const active = users.filter((user) => user.status === "active");
  const rejected = users.filter((user) => user.status === "rejected");

  if (authUser?.role !== "Owner") {
    return (
      <div className="rounded-[var(--panel-radius)] border border-destructive/25 bg-destructive/[0.04] p-6">
        <h2 className="text-lg font-bold">User Approvals</h2>
        <p className="mt-2 text-sm text-muted-foreground">Only the Owner can approve Urban Castle login access.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">User Approvals</h2>
            <p className="text-xs text-muted-foreground">Approve or reject Supabase Auth users before they can enter Urban Castle.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadUsers()} disabled={busy}>Refresh</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Pending" value={pending.length} tone="warning" icon={<Clock3 className="h-4 w-4" />} />
        <MetricCard label="Active" value={active.length} tone="success" icon={<UserCheck className="h-4 w-4" />} />
        <MetricCard label="Rejected" value={rejected.length} tone="destructive" icon={<UserX className="h-4 w-4" />} />
        <MetricCard label="Total users" value={users.length} tone="primary" icon={<Users className="h-4 w-4" />} />
      </div>

      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <h3 className="text-sm font-semibold">Pending access requests</h3>
          <span className="text-[11px] text-muted-foreground">{pending.length} waiting</span>
        </div>
        <div className="divide-y divide-border">
          {pending.map((user) => <PendingUserRow key={user.id} user={user} busy={busy} onUpdate={updateUser} />)}
          {pending.length === 0 ? <EmptyState title="No pending users" description="New signup requests will appear here for owner approval." icon={<CheckCircle2 className="h-8 w-8" />} /> : null}
        </div>
      </div>

      <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <h3 className="text-sm font-semibold">Approved and rejected users</h3>
          <span className="text-[11px] text-muted-foreground">{users.length - pending.length} records</span>
        </div>
        <div className="divide-y divide-border">
          {users.filter((user) => user.status !== "pending").map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-bold">{user.display_name || user.email || "Unnamed user"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{user.email} · {roleLabel(user.role)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{user.approved_at ? `Approved ${relativeDay(user.approved_at)}` : user.rejected_at ? `Rejected ${relativeDay(user.rejected_at)}` : `Updated ${relativeDay(user.updated_at)}`}</span>
                <StatusBadge label={user.status} className={statusClass(user.status)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PendingUserRow({ user, busy, onUpdate }: {
  user: RDashUserRow;
  busy: boolean;
  onUpdate: (input: { id: string; action: "approve" | "reject"; role?: string; displayName?: string; staffId?: string }) => Promise<void>;
}) {
  const [role, setRole] = React.useState(user.role || "FIELD_STAFF");
  const [displayName, setDisplayName] = React.useState(user.display_name || "");
  const [staffId, setStaffId] = React.useState(user.staff_id || "");

  return (
    <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_340px_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-bold">{user.display_name || user.email || "Pending user"}</p>
          <StatusBadge label="pending" className={statusClass("pending")} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email} · requested {roleLabel(user.role)} · {relativeDay(user.created_at)}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" className="h-8 text-xs" />
        <select value={role} onChange={(event) => setRole(event.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
          {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Input value={staffId} onChange={(event) => setStaffId(event.target.value)} placeholder="Staff ID optional" className="h-8 text-xs" />
      </div>
      <div className="flex items-center gap-2 lg:justify-end">
        <Button size="sm" disabled={busy} onClick={() => void onUpdate({ id: user.id, action: "approve", role, displayName, staffId })}>Approve</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void onUpdate({ id: user.id, action: "reject" })}>Reject</Button>
      </div>
    </div>
  );
}
