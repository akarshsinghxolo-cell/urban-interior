"use client";

import type { RDashState } from "./store/types";
import { fieldStaffPresentationDatabase } from "./field-staff-presentation";
import { installContractorStorePolicy } from "./contractor-store-policy";
import { useRDashStore as useUnfilteredRDashStore } from "./raw-store";

export * from "./raw-store";

installContractorStorePolicy(useUnfilteredRDashStore);

type StoreSelector<T> = (state: RDashState) => T;

function stateForPresentation(state: RDashState): RDashState {
  const user = state.authUser;
  if (!user || user.role !== "Field Staff") return state;
  return {
    ...state,
    db: fieldStaffPresentationDatabase(state.db, user),
  };
}

function useVisibleRDashStore<T = RDashState>(selector?: StoreSelector<T>): T {
  const select = selector || ((state: RDashState) => state as unknown as T);
  return useUnfilteredRDashStore((state) => select(stateForPresentation(state)));
}

/**
 * React consumers see a role-filtered presentation state. Imperative store APIs
 * remain attached to the complete underlying store so saves and synchronization
 * never treat UI-hidden records as deleted data.
 */
export const useRDashStore = Object.assign(
  useVisibleRDashStore,
  useUnfilteredRDashStore,
) as typeof useUnfilteredRDashStore;
