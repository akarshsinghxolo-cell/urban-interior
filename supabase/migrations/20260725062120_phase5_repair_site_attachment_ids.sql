-- Replace historical Google Drive file IDs with Urban Castle attachment IDs.
update public."entity_sites"
set data=jsonb_set(
      data,
      '{photo_attachment_ids}',
      '["attach-mruygs02-ozdpa","attach-mruygvbo-0oxkd","attach-mruygxtj-i6l4t","attach-mruyh06q-zih9d","attach-mruyh2sg-e35dc"]'::jsonb,
      true
    ),
    revision=revision+1,
    updated_at=now(),
    updated_by='Phase 5 attachment identifier reconciliation'
where id='site-mruygfd8cx9g'
  and data->'photo_attachment_ids'='["1hWPPgudULwnZjxKs1Nke34D6UkY9xde-","1zU2OxYxWsTL2-nXMsO3M1abga3tAuTk5","1b7DS4tpQodeFrR0W5bRI2BXvFC0oiJ44","1BCHIc9sb9S21GIIdm6zv6QxOziuXycnm","1CLOqZZCiAFPgQg8JzW7QkhIGujz22Nvu"]'::jsonb;

select public.uc_bump_workspace_revision('default')
where exists (
  select 1 from public."entity_sites"
  where id='site-mruygfd8cx9g'
    and data->'photo_attachment_ids'='["attach-mruygs02-ozdpa","attach-mruygvbo-0oxkd","attach-mruygxtj-i6l4t","attach-mruyh06q-zih9d","attach-mruyh2sg-e35dc"]'::jsonb
);
