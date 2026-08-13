-- Canonical Vendor profile cutover.
-- supply_capabilities is the only Vendor supply model. Live Vendor Rates are
-- already empty in production at this cutover, but legacy keys are stripped
-- defensively if rows exist in another environment.

update public."entity_master_vendors" v
set data = (
  v.data
  - 'article_ids' - 'capabilities_v2' - 'verified_bank'
  - 'pan' - 'bank_account' - 'ifsc' - 'payment_terms' - 'credit_days'
  - 'credit_limit' - 'minimum_order_value' - 'standard_lead_time_days'
  - 'warranty_terms' - 'udyam_no'
) || jsonb_build_object(
  'supply_capabilities',
  case
    when jsonb_typeof(v.data->'supply_capabilities') = 'array' then v.data->'supply_capabilities'
    else coalesce((
      select jsonb_agg(capability order by ord)
      from (
        select ord, jsonb_strip_nulls(jsonb_build_object(
          'id', coalesce(nullif(item->>'id',''), 'vendor-cap-' || coalesce(item->>'article_id','unknown')),
          'article_id', item->>'article_id',
          'article_name', item->>'article_name',
          'variant_ids', case when nullif(item->>'variant_id','') is null then '[]'::jsonb else jsonb_build_array(item->>'variant_id') end,
          'brand', item->>'brand',
          'availability', case coalesce(item->>'supply_mode','') when 'stocked' then 'in_stock' when 'on_order' then 'on_order' when 'special_order' then 'on_order' else 'unknown' end,
          'typical_lead_time_days', nullif(item->>'lead_time_days','')::numeric,
          'moq', nullif(item->>'minimum_order_qty','')::numeric,
          'preferred', coalesce((item->>'preferred')::boolean,false),
          'status', coalesce(nullif(item->>'status',''),'active'),
          'notes', item->>'notes'
        )) capability
        from jsonb_array_elements(case when jsonb_typeof(v.data->'capabilities_v2')='array' then v.data->'capabilities_v2' else '[]'::jsonb end) with ordinality rows(item,ord)
        where nullif(item->>'article_id','') is not null
        union all
        select 100000 + ord, jsonb_build_object('id','vendor-cap-' || article_id,'article_id',article_id,'variant_ids','[]'::jsonb,'availability','unknown','preferred',false,'status','active')
        from jsonb_array_elements_text(case when jsonb_typeof(v.data->'article_ids')='array' then v.data->'article_ids' else '[]'::jsonb end) with ordinality ids(article_id,ord)
        where not exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(v.data->'capabilities_v2')='array' then v.data->'capabilities_v2' else '[]'::jsonb end) old
          where old->>'article_id'=article_id
        )
      ) migrated
    ), '[]'::jsonb)
  end
);

update public."entity_master_vendorRates"
set data = jsonb_strip_nulls(jsonb_build_object(
  'id', data->>'id',
  'vendor_id', data->>'vendor_id',
  'article_id', data->>'article_id',
  'variant_id', nullif(data->>'variant_id',''),
  'quoted_rate', coalesce(nullif(data->>'quoted_rate','')::numeric, nullif(data->>'rate','')::numeric),
  'status', case when data->>'status'='inactive' then 'inactive' else 'active' end,
  'created_at', coalesce(data->>'created_at', data->>'updated_at', now()::text),
  'updated_at', coalesce(data->>'updated_at', now()::text)
));
