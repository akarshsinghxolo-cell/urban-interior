with rebuilt as (
  select wr.id,
         jsonb_agg(
           case
             when coalesce(item.value->>'subcategory_id','') <> ''
              and coalesce(item.value->>'work_type_id','') = ''
              and coalesce(
                nullif(item.value->'option_pairs'->0->>'work_type_id',''),
                nullif(sub.data->'work_types'->0->>'id','')
              ) is not null
             then jsonb_set(
               item.value,
               '{work_type_id}',
               to_jsonb(coalesce(
                 nullif(item.value->'option_pairs'->0->>'work_type_id',''),
                 nullif(sub.data->'work_types'->0->>'id','')
               )),
               true
             )
             else item.value
           end
           order by item.ord
         ) as structured_items,
         bool_or(
           coalesce(item.value->>'subcategory_id','') <> ''
           and coalesce(item.value->>'work_type_id','') = ''
         ) as had_missing
  from public."entity_workRequired" wr
  cross join lateral jsonb_array_elements(coalesce(wr.data->'structured_items','[]'::jsonb))
    with ordinality as item(value, ord)
  left join public."entity_master_workSubcategories" sub
    on sub.id = item.value->>'subcategory_id'
  group by wr.id
)
update public."entity_workRequired" wr
set data = jsonb_set(wr.data, '{structured_items}', rebuilt.structured_items, true),
    updated_at = now()
from rebuilt
where wr.id = rebuilt.id
  and rebuilt.had_missing;
