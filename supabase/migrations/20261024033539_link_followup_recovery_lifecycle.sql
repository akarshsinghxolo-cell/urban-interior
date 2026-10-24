-- Preserve original task payloads in-place. No task, follow-up, note or file is deleted.
-- Rollback data by restoring recovery_link_backfill.original_data and journaling
-- those restored rows through commit_workspace_operations; do not rewind revisions.
lock table public.entity_workspace_revision in share row exclusive mode;
lock table public.entity_tasks, public.entity_followups in share row exclusive mode;

create temporary table recovery_sources on commit drop as
select t.workspace_id, t.id task_id, f.id followup_id
from public.entity_tasks t
join public.entity_followups f on f.workspace_id = t.workspace_id
  and t.data ->> 'title' = 'Recover missed follow-up · ' || (f.data ->> 'title')
  and (t.data ->> 'customer_id') is not distinct from (f.data ->> 'customer_id')
  and abs(extract(epoch from ((t.data ->> 'created_at')::timestamptz - (f.data ->> 'missed_at')::timestamptz))) < 1
where t.data ->> 'task_type' = 'followup_recovery'
  and nullif(t.data ->> 'source_followup_id', '') is null;

do $$
begin
  if exists (
    select t.id from public.entity_tasks t
    left join recovery_sources s on s.workspace_id=t.workspace_id and s.task_id=t.id
    where t.data ->> 'task_type'='followup_recovery'
      and nullif(t.data ->> 'source_followup_id','') is null
    group by t.workspace_id,t.id having count(s.followup_id) <> 1
  ) then raise exception 'Recovery source matching is missing or ambiguous; no changes applied'; end if;
end $$;

update public.entity_tasks t
set data = t.data || jsonb_build_object(
    'source_followup_id', f.id,
    'recovery_link_backfill', jsonb_build_object('migration','link_followup_recovery_lifecycle','original_data',t.data),
    'updated_at',now()
  ) || case when f.data ->> 'status' in ('completed','closed') and t.data ->> 'status' not in ('completed','cancelled')
    then jsonb_strip_nulls(jsonb_build_object('status','completed',
      'completion_note','Resolved through the linked follow-up.',
      'completed_at',coalesce(f.data ->> 'completed_at',f.data ->> 'updated_at'),
      'completed_by',f.data ->> 'completed_by')) else '{}'::jsonb end,
  revision=t.revision+1, updated_at=now()
from recovery_sources s join public.entity_followups f on f.workspace_id=s.workspace_id and f.id=s.followup_id
where t.workspace_id=s.workspace_id and t.id=s.task_id;

alter table public.entity_tasks add column source_followup_id_gen text
  generated always as (nullif(data ->> 'source_followup_id','')) stored;
create unique index entity_followups_workspace_id_uidx on public.entity_followups(workspace_id,id);
alter table public.entity_tasks add constraint entity_tasks_source_followup_fk
  foreign key (workspace_id,source_followup_id_gen) references public.entity_followups(workspace_id,id) on delete restrict;
create unique index entity_tasks_one_open_recovery_per_followup
  on public.entity_tasks(workspace_id,source_followup_id_gen)
  where source_followup_id_gen is not null and data ->> 'status' not in ('completed','cancelled');
alter table public.entity_tasks add constraint entity_tasks_recovery_source_required
  check (coalesce(data ->> 'task_type','') <> 'followup_recovery' or source_followup_id_gen is not null);

-- Publish the correction through the existing change journal so open clients refresh.
insert into public.entity_workspace_change_batches(workspace_id,revision,operations,row_versions,is_baseline,created_at)
select r.id,r.revision+1,
  jsonb_build_array(jsonb_build_object('collection','tasks','upsert',jsonb_agg(t.data order by t.id),'deleteIds','[]'::jsonb)),
  jsonb_object_agg('tasks:'||t.id,to_jsonb(t.revision)),false,now()
from public.entity_workspace_revision r
join recovery_sources s on s.workspace_id=r.id
join public.entity_tasks t on t.workspace_id=s.workspace_id and t.id=s.task_id
group by r.id,r.revision;
update public.entity_workspace_revision r set revision=revision+1,updated_at=now()
where exists(select 1 from recovery_sources s where s.workspace_id=r.id);
