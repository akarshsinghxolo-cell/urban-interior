with targets as (
  select wr.id,
         jsonb_agg(to_jsonb(sub.data->'work_types'->0->>'id') order by selected.ord) as work_type_ids
  from public."entity_workRequired" wr
  cross join lateral jsonb_array_elements_text(coalesce(wr.data->'work_subcategory_ids','[]'::jsonb))
    with ordinality as selected(subcategory_id, ord)
  join public."entity_master_workSubcategories" sub on sub.id = selected.subcategory_id
  where jsonb_array_length(coalesce(wr.data->'work_subcategory_ids','[]'::jsonb)) > 0
    and jsonb_array_length(coalesce(wr.data->'work_type_ids','[]'::jsonb)) = 0
    and sub.data->'work_types'->0->>'id' is not null
  group by wr.id
)
update public."entity_workRequired" wr
set data = jsonb_set(wr.data, '{work_type_ids}', targets.work_type_ids, true),
    updated_at = now()
from targets
where wr.id = targets.id;
