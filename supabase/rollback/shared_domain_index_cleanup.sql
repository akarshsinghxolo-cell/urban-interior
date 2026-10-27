-- Optional standalone reversal of index cleanup. Full expansion rollback also
-- tolerates an already-removed duplicate and does not require this step.
CREATE UNIQUE INDEX IF NOT EXISTS s2_1ce0b1450d6833b31a0c9a70
  ON public.entity_commercial_documents (collection, workspace_id, id);
