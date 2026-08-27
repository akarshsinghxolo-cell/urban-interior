update public."entity_workRequired"
set data = jsonb_set(
  data - 'work_subcategory_id',
  '{work_subcategory_ids}',
  jsonb_build_array(data ->> 'work_subcategory_id'),
  true
)
where data ? 'work_subcategory_id'
  and nullif(btrim(data ->> 'work_subcategory_id'), '') is not null
  and not (data ? 'work_subcategory_ids');
