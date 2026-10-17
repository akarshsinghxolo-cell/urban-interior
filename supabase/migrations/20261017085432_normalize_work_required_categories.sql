-- Categories are determined by work_subcategory_ids. Keep the database shape
-- aligned with that canonical relationship, then remove the duplicated
-- single-category value so one Work Required can span categories.
alter table public."entity_workRequired"
  drop constraint entity_workrequired_data_shape_chk;

alter table public."entity_workRequired"
  add constraint entity_workrequired_data_shape_chk check (
    jsonb_typeof(data) = 'object'
    and data ->> 'id' = id
    and coalesce(btrim(data ->> 'customer_id'), '') <> ''
    and coalesce(btrim(data ->> 'title'), '') <> ''
    and (data -> 'area_ids' is null or jsonb_typeof(data -> 'area_ids') = 'array')
    and jsonb_typeof(data -> 'work_subcategory_ids') = 'array'
    and jsonb_array_length(data -> 'work_subcategory_ids') > 0
    and jsonb_typeof(data -> 'work_type_ids') = 'array'
    and jsonb_array_length(data -> 'work_type_ids') > 0
  );

update public."entity_workRequired"
set data = data - 'work_category_id'
where data ? 'work_category_id';
