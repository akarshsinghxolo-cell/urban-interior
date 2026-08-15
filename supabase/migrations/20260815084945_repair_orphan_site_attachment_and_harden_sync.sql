-- Repair site photo references whose EntityFileAttachment was never committed.
-- Every affected row is backed up before mutation so the repair is reversible.
do $repair$
declare
  repaired_count integer := 0;
begin
  insert into public."GenericRecord" (collection, id, "dataJson")
  select
    'integrity.repair.backup',
    sites.id || ':20260815084945',
    jsonb_build_object(
      'migration', '20260815084945_repair_orphan_site_attachment_and_harden_sync',
      'table', 'entity_sites',
      'id', sites.id,
      'workspace_id', sites.workspace_id,
      'revision', sites.revision,
      'data', sites.data,
      'backed_up_at', now()
    )::text
  from public.entity_sites as sites
  where jsonb_typeof(sites.data->'photo_attachment_ids') = 'array'
    and exists (
      select 1
      from jsonb_array_elements_text(sites.data->'photo_attachment_ids') as ref(attachment_id)
      where not exists (
        select 1
        from public."entity_entityFileAttachments" as attachments
        where attachments.id = ref.attachment_id
          and attachments.workspace_id = sites.workspace_id
      )
    )
  on conflict (collection, id) do nothing;

  update public.entity_sites as sites
  set
    data = jsonb_set(
      sites.data,
      '{photo_attachment_ids}',
      coalesce((
        select jsonb_agg(ref.attachment_id order by ref.ordinality)
        from jsonb_array_elements_text(sites.data->'photo_attachment_ids')
          with ordinality as ref(attachment_id, ordinality)
        where exists (
          select 1
          from public."entity_entityFileAttachments" as attachments
          where attachments.id = ref.attachment_id
            and attachments.workspace_id = sites.workspace_id
        )
      ), '[]'::jsonb),
      true
    ),
    revision = sites.revision + 1,
    updated_at = now(),
    updated_by = '20260815084945 integrity repair'
  where jsonb_typeof(sites.data->'photo_attachment_ids') = 'array'
    and exists (
      select 1
      from jsonb_array_elements_text(sites.data->'photo_attachment_ids') as ref(attachment_id)
      where not exists (
        select 1
        from public."entity_entityFileAttachments" as attachments
        where attachments.id = ref.attachment_id
          and attachments.workspace_id = sites.workspace_id
      )
    );

  get diagnostics repaired_count = row_count;
  if repaired_count > 0 then
    perform public.uc_bump_workspace_revision('default');
  end if;
end
$repair$;
