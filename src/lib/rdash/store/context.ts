import type { RDashDatabase } from "../types";
import type { StaffLocationPing } from "../staff-location";
import type {
  AuthenticatedWorkspaceUser,
  CurrentUserContext,
  GuardResult,
} from "./ui-types";

/**
 * The shared context passed to every slice factory.
 *
 * Slices MUST NOT call the raw Zustand `setBase` directly — they use
 * `commitState`, which handles normalization + validation + server-save
 * queueing. `get` returns the full merged state so cross-slice action
 * calls (e.g. `get().logAudit(...)`) work transparently.
 *
 * `runWorkspaceTransaction` lives in the core and wraps every action via
 * the auto-wrap proxy — slices never call it directly.
 */
export interface StoreContext {
  /** Returns the full merged RDashState. */
  get: () => any; // typed as `any` here to avoid a circular import with RDashState; the core assembly provides the concrete type.
  /** Raw Zustand setter — used only by core infrastructure (sync status, restored DB). */
  setBase: (partial: any) => void;
  /** The normal setter every action uses. Normalizes the DB, validates business rules, and queues a server save. */
  commitState: (partial: any) => void;
  /** Returns true when the current action is running inside a nested transaction (depth > 1). */
  isNestedTransaction: () => boolean;
}
