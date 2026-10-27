-- One-time PR239 pre-cutover correction for the 12 verified legacy links.
-- Keeps every thread ID, message and other payload field; writes the revision journal.
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '30s';
SELECT revision FROM public.entity_workspace_revision WHERE id='default' FOR UPDATE;

CREATE TEMP TABLE uc_customer_threads_before ON COMMIT DROP AS
SELECT t.* FROM public.entity_threads t
JOIN public.entity_customers c ON c.workspace_id=t.workspace_id AND c.id=t.data->>'record_id'
WHERE t.workspace_id='default' AND t.data->>'kind'='generic' AND t.data->>'record_type'='generic';

DO $guard$
BEGIN
  IF (SELECT count(*) FROM uc_customer_threads_before) <> 12 THEN
    RAISE EXCEPTION 'Expected exactly 12 reviewed legacy Customer thread links; refresh the checkpoint and audit';
  END IF;
END $guard$;

SELECT public.commit_workspace_operations('default',
  (SELECT revision FROM public.entity_workspace_revision WHERE id='default'),
  jsonb_build_array(jsonb_build_object('collection','threads','table','entity_threads','upsert',
    (SELECT jsonb_agg(data || jsonb_build_object('record_id', 'customer-conversation:' || (data->>'record_id')) ORDER BY id) FROM uc_customer_threads_before))),
  (SELECT jsonb_object_agg('threads:' || id, revision) FROM uc_customer_threads_before)
);

DO $verify$
BEGIN
  IF EXISTS (
    SELECT FROM uc_customer_threads_before before
    LEFT JOIN public.entity_threads after ON after.id=before.id AND after.workspace_id=before.workspace_id
    WHERE after.id IS NULL OR (after.data-'record_id') IS DISTINCT FROM (before.data-'record_id')
       OR after.data->>'record_id' IS DISTINCT FROM ('customer-conversation:' || (before.data->>'record_id'))
       OR after.revision <> before.revision+1
  ) THEN RAISE EXCEPTION 'Thread identity, history or revision verification failed'; END IF;
END $verify$;
COMMIT;
