delete from public."entity_master_workCategories" category
where category.id = 'cat-mse62gzt-dz4pa'
  and category.data ->> 'name' = 'Fasle ceiling'
  and not exists (
    select 1 from public."entity_master_workSubcategories" subcategory
    where subcategory.workspace_id = category.workspace_id
      and subcategory.data ->> 'category_id' = category.id
  )
  and public.uc_taxonomy_reference_table(
    category.workspace_id,
    category.id,
    'public."entity_master_workCategories"'::regclass,
    category.id
  ) is null;

update public.entity_workspace_revision
set revision = revision + 1, updated_at = now();
