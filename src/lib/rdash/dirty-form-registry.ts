export type DirtyFormResolution = "save" | "discard" | "stay";
export type DirtyFormTaskResult = void | boolean | Promise<void | boolean>;

export interface DirtyFormRegistration {
  id: string;
  label: string;
  dirty: boolean;
  save: () => DirtyFormTaskResult;
  discard: () => DirtyFormTaskResult;
}

interface DirtyFormEntry extends DirtyFormRegistration {}

interface PendingNavigationInternal {
  id: string;
  reason: string;
  proceed: () => void;
  onStay?: () => void;
}

export interface DirtyFormSummary {
  id: string;
  label: string;
}

export interface DirtyFormRegistrySnapshot {
  dirtyForms: readonly DirtyFormSummary[];
  pendingNavigation: { id: string; reason: string } | null;
  resolving: Exclude<DirtyFormResolution, "stay"> | null;
  error: string | null;
}

const entries = new Map<string, DirtyFormEntry>();
const listeners = new Set<() => void>();
let pendingNavigation: PendingNavigationInternal | null = null;
let resolving: Exclude<DirtyFormResolution, "stay"> | null = null;
let error: string | null = null;
let navigationSequence = 0;
let snapshot: DirtyFormRegistrySnapshot = {
  dirtyForms: [],
  pendingNavigation: null,
  resolving: null,
  error: null,
};

function normalizedRegistration(registration: DirtyFormRegistration): DirtyFormEntry {
  const id = String(registration.id || "").trim();
  if (!id) throw new Error("A dirty form registration requires a stable ID.");
  return {
    ...registration,
    id,
    label: String(registration.label || "Unsaved form").trim() || "Unsaved form",
    dirty: Boolean(registration.dirty),
  };
}

function dirtyEntries(): DirtyFormEntry[] {
  return [...entries.values()].filter((entry) => entry.dirty);
}

function emit(): void {
  snapshot = {
    dirtyForms: dirtyEntries().map((entry) => ({ id: entry.id, label: entry.label })),
    pendingNavigation: pendingNavigation
      ? { id: pendingNavigation.id, reason: pendingNavigation.reason }
      : null,
    resolving,
    error,
  };
  for (const listener of listeners) listener();
}

function errorMessage(caught: unknown): string {
  if (caught instanceof Error && caught.message.trim()) return caught.message;
  return "The unsaved changes could not be processed. Review the form and try again.";
}

export const dirtyFormRegistry = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): DirtyFormRegistrySnapshot {
    return snapshot;
  },

  register(registration: DirtyFormRegistration): () => void {
    const entry = normalizedRegistration(registration);
    entries.set(entry.id, entry);
    emit();
    return () => {
      if (!entries.has(entry.id)) return;
      entries.delete(entry.id);
      emit();
    };
  },

  update(id: string, patch: Partial<Omit<DirtyFormRegistration, "id">>): void {
    const current = entries.get(id);
    if (!current) return;
    entries.set(id, normalizedRegistration({ ...current, ...patch, id }));
    emit();
  },

  markClean(id: string): void {
    const current = entries.get(id);
    if (!current || !current.dirty) return;
    entries.set(id, { ...current, dirty: false });
    emit();
  },

  remove(id: string): void {
    if (!entries.delete(id)) return;
    emit();
  },

  hasDirtyForms(): boolean {
    return dirtyEntries().length > 0;
  },

  requestNavigation(
    proceed: () => void,
    options: { reason?: string; onStay?: () => void } = {},
  ): boolean {
    if (!this.hasDirtyForms()) {
      proceed();
      return true;
    }
    if (pendingNavigation) return false;
    navigationSequence += 1;
    pendingNavigation = {
      id: `dirty-nav-${Date.now().toString(36)}-${navigationSequence.toString(36)}`,
      reason: options.reason || "leave the current form",
      proceed,
      onStay: options.onStay,
    };
    error = null;
    emit();
    return false;
  },

  async resolve(action: DirtyFormResolution): Promise<boolean> {
    const pending = pendingNavigation;
    if (!pending || resolving) return false;

    if (action === "stay") {
      pendingNavigation = null;
      error = null;
      emit();
      pending.onStay?.();
      return true;
    }

    resolving = action;
    error = null;
    emit();
    const forms = dirtyEntries();

    try {
      for (const form of forms) {
        const result = action === "save" ? await form.save() : await form.discard();
        if (result === false) {
          throw new Error(
            action === "save"
              ? `${form.label} could not be saved. Review the highlighted fields and try again.`
              : `${form.label} could not be discarded. Try again.`,
          );
        }
      }

      for (const form of forms) {
        const current = entries.get(form.id);
        if (current) entries.set(form.id, { ...current, dirty: false });
      }

      pendingNavigation = null;
      resolving = null;
      error = null;
      emit();
      try {
        pending.proceed();
      } catch (caught) {
        console.error("[dirty-form-registry] guarded navigation failed:", caught);
      }
      return true;
    } catch (caught) {
      resolving = null;
      error = errorMessage(caught);
      emit();
      return false;
    }
  },

  resetForTests(): void {
    entries.clear();
    pendingNavigation = null;
    resolving = null;
    error = null;
    navigationSequence = 0;
    emit();
  },
};
