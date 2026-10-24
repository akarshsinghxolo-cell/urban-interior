-- User confirmed these services have identical scope and pricing rules.
-- Only unused duplicate identities are retired. Every original row is preserved
-- in the existing audit log; any new external reference aborts the transaction.
lock table public.entity_workspace_revision in share row exclusive mode;
lock table public."entity_master_workSubcategories", public."entity_master_subcategoryArticleMap" in share row exclusive mode;

create temporary table service_pairs on commit drop as
select keep.workspace_id, keep.id keep_id, old.id old_id,
  keep.data keep_data, old.data old_data
from (values
  ('Texture Paint (Exterior)', 'Paint Work', 'Facade & Exterior Cladding'),
  ('Glazing Work', 'Facade & Exterior Cladding', 'Glass Work')
) desired(service_name,keep_category,old_category)
join public."entity_master_workCategories" kc on kc.data->>'name'=desired.keep_category
join public."entity_master_workCategories" oc on oc.workspace_id=kc.workspace_id and oc.data->>'name'=desired.old_category
join public."entity_master_workSubcategories" keep on keep.workspace_id=kc.workspace_id and keep.data->>'category_id'=kc.id and keep.data->>'name'=desired.service_name
join public."entity_master_workSubcategories" old on old.workspace_id=oc.workspace_id and old.data->>'category_id'=oc.id and old.data->>'name'=desired.service_name;

do $$ begin
  if (select count(*) from service_pairs) <> 2 then raise exception 'Expected exactly two confirmed service pairs'; end if;
  if exists(select 1 from service_pairs where keep_data->>'unit_id' is distinct from old_data->>'unit_id'
    or jsonb_array_length(keep_data->'work_types')<>1 or jsonb_array_length(old_data->'work_types')<>1
    or keep_data#>>'{work_types,0,name}' is distinct from old_data#>>'{work_types,0,name}'
    or keep_data#>>'{work_types,0,unit_id}' is distinct from old_data#>>'{work_types,0,unit_id}')
  then raise exception 'Service units or work types changed; review before merging'; end if;
end $$;

create temporary table retired_materials on commit drop as
select m.workspace_id,m.id,m.data from public."entity_master_subcategoryArticleMap" m
join service_pairs p on p.workspace_id=m.workspace_id and p.old_id=m.data->>'work_required_id';
do $$ begin
  if exists(select 1 from retired_materials m join service_pairs p on p.workspace_id=m.workspace_id and p.old_id=m.data->>'work_required_id'
    where not exists(select 1 from public."entity_master_subcategoryArticleMap" k
      where k.workspace_id=m.workspace_id and k.data->>'work_required_id'=p.keep_id
      and k.data - array['id','work_required_id','created_at','updated_at'] = m.data - array['id','work_required_id','created_at','updated_at']))
  then raise exception 'A duplicate material differs; retain it until reviewed'; end if;
end $$;

create temporary table retiring_ids on commit drop as
select workspace_id,old_id id from service_pairs
union select workspace_id,old_data#>>'{work_types,0,id}' from service_pairs
union select workspace_id,id from retired_materials;

do $$
declare t record; found_reference boolean;
begin
  for t in select c.table_name from information_schema.columns c
    where c.table_schema='public' and c.column_name='data' and c.table_name like 'entity\_%' escape '\'
  loop
    execute format('select exists(select 1 from public.%I e join retiring_ids i on i.workspace_id=e.workspace_id
      where jsonb_path_exists(e.data, ''$.** ? (@ == $target)'',jsonb_build_object(''target'',to_jsonb(i.id)))
      and not ($1=''entity_master_workSubcategories'' and exists(select 1 from service_pairs p where p.workspace_id=e.workspace_id and p.old_id=e.id))
      and not ($1=''entity_master_subcategoryArticleMap'' and exists(select 1 from retired_materials m where m.workspace_id=e.workspace_id and m.id=e.id)))',t.table_name)
      into found_reference using t.table_name;
    if found_reference then raise exception 'Retired catalogue identity is referenced in %; merge aborted',t.table_name; end if;
  end loop;
end $$;

update public."entity_master_workSubcategories" k
set data=k.data || jsonb_build_object('category_ids',jsonb_build_array(p.keep_data->>'category_id',p.old_data->>'category_id'),'updated_at',now()),
  revision=k.revision+1,updated_at=now()
from service_pairs p where p.workspace_id=k.workspace_id and p.keep_id=k.id;
delete from public."entity_master_subcategoryArticleMap" m using retired_materials r where r.workspace_id=m.workspace_id and r.id=m.id;
delete from public."entity_master_workSubcategories" s using service_pairs p where p.workspace_id=s.workspace_id and p.old_id=s.id;

-- Reuse the audit trail for rollback evidence instead of another backup table.
insert into public."entity_auditLog"(id,workspace_id,revision,data,updated_at)
select 'audit-catalogue-consolidation-20261024-'||p.workspace_id,p.workspace_id,1,
 jsonb_build_object('id','audit-catalogue-consolidation-20261024-'||p.workspace_id,'timestamp',now(),
 'actor','Database migration','actor_role','Owner','kind','system','entity_type','workspace',
 'action','Consolidated two confirmed shared catalogue services; preserved originals for rollback.',
 'before',jsonb_build_object('workSubcategories',jsonb_agg(p.keep_data)||jsonb_agg(p.old_data),
   'subcategoryArticleMap',(select coalesce(jsonb_agg(m.data),'[]'::jsonb) from retired_materials m where m.workspace_id=p.workspace_id))),now()
from service_pairs p group by p.workspace_id;

create or replace function public.uc_guard_shared_service_categories()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.data ? 'category_ids' then
    if jsonb_typeof(new.data->'category_ids') <> 'array' then raise exception 'Service categories must be an array'; end if;
    if exists(select 1 from jsonb_array_elements_text(new.data->'category_ids') category(value)
      where not exists(select 1 from public."entity_master_workCategories" c where c.workspace_id=new.workspace_id and c.id=category.value))
    then raise exception 'Shared service category does not exist' using errcode='23503'; end if;
  end if;
  return new;
end $$;
revoke all on function public.uc_guard_shared_service_categories() from public,anon,authenticated;
grant execute on function public.uc_guard_shared_service_categories() to service_role;
create trigger entity_master_shared_service_categories_guard before insert or update on public."entity_master_workSubcategories"
for each row execute function public.uc_guard_shared_service_categories();

insert into public.entity_workspace_change_batches(workspace_id,revision,operations,row_versions,is_baseline,created_at)
select r.id,r.revision+1,jsonb_build_array(
 jsonb_build_object('collection','master.workSubcategories','upsert',(select jsonb_agg(k.data) from public."entity_master_workSubcategories" k join service_pairs p on p.workspace_id=k.workspace_id and p.keep_id=k.id where k.workspace_id=r.id),
  'deleteIds',(select jsonb_agg(old_id) from service_pairs p where p.workspace_id=r.id)),
 jsonb_build_object('collection','master.subcategoryArticleMap','upsert','[]'::jsonb,'deleteIds',(select coalesce(jsonb_agg(id),'[]'::jsonb) from retired_materials m where m.workspace_id=r.id)),
 jsonb_build_object('collection','auditLog','upsert',(select jsonb_agg(a.data) from public."entity_auditLog" a where a.workspace_id=r.id and a.id='audit-catalogue-consolidation-20261024-'||r.id),'deleteIds','[]'::jsonb)),
 (select jsonb_object_agg('master.workSubcategories:'||k.id,to_jsonb(k.revision)) from public."entity_master_workSubcategories" k join service_pairs p on p.workspace_id=k.workspace_id and p.keep_id=k.id where k.workspace_id=r.id),false,now()
from public.entity_workspace_revision r where exists(select 1 from service_pairs p where p.workspace_id=r.id);
update public.entity_workspace_revision r set revision=revision+1,updated_at=now()
where exists(select 1 from service_pairs p where p.workspace_id=r.id);
