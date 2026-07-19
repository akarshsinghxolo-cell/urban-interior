"use client";

import * as React from "react";
import { Pencil, Check, X, UserCircle2 } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { initAuthFetch, getSessionToken, setSessionToken } from "@/lib/rdash/client-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * ProfileNameEditor — an inline-editable display name in the header.
 *
 * Shows the user's name as static text with an edit pencil. Clicking the
 * pencil turns the name into an input field. On save (check button or Enter),
 * it calls PUT /api/auth/profile to update the name in the session JWT,
 * then updates the Zustand store (updateAuthUser) so the change is
 * immediately visible everywhere.
 *
 * The name change persists for the session's lifetime (until the JWT expires
 * or logout). For the super-owner, the name is hardcoded in source
 * (auth.ts SUPER_OWNER), but this endpoint overrides it in the session token.
 * For Supabase users, the name would also be updated in Supabase Auth.
 */
export function ProfileNameEditor() {
  const authUser = useRDashStore((s) => s.authUser);
  const updateAuthUser = useRDashStore((s) => s.updateAuthUser);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(authUser?.name || "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (authUser?.name) setName(authUser.name);
  }, [authUser?.name]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === authUser?.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      initAuthFetch();
      const token = getSessionToken();
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Profile update failed.");
      if (payload.token) setSessionToken(payload.token);
      updateAuthUser({ name: trimmed });
      toast.success("Name updated", { description: "Your display name has been changed.", duration: 3000 });
      setEditing(false);
    } catch (error) {
      toast.error("Update failed", {
        description: error instanceof Error ? error.message : "Could not update name.",
        duration: 5000,
      });
      setName(authUser?.name || "");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setName(authUser?.name || "");
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          autoFocus
          maxLength={100}
          className="w-[120px] rounded-md border border-input bg-background px-2 py-0.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder="Your name"
          disabled={saving}
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-5 w-5 items-center justify-center rounded text-success transition-colors hover:bg-success/10 disabled:opacity-50"
          title="Save name"
          aria-label="Save name"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          title="Cancel"
          aria-label="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className="max-w-[140px] truncate">{authUser?.name || "User"}</span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
        title="Edit name"
        aria-label="Edit name"
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}
