BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE public.entity_workspace_revision,public.entity_master_contractors,public.entity_master_vendors,public.entity_rate_cards IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.entity_master_vendors DROP CONSTRAINT uc_vendor_no_derived_balance;
ALTER TABLE public.entity_master_contractors DROP CONSTRAINT uc_contractor_no_derived_summary;
ALTER TABLE public.entity_rate_cards DROP CONSTRAINT uc_contractor_rates_virtual;
INSERT INTO public.entity_rate_cards(collection,id,workspace_id,revision,updated_at,updated_by,data)
SELECT collection,id,workspace_id,revision,updated_at,updated_by,data FROM public.entity_contractor_rate_read;
DROP TRIGGER uc_contractor_rate_unit_reference ON public.entity_master_contractors;
DROP TRIGGER uc_unit_canonical_rate_reference ON public.entity_master_units;
DROP FUNCTION public.uc_validate_canonical_rate_units();
DROP VIEW public.entity_contractor_rate_read;
CREATE OR REPLACE FUNCTION public.uc_collection_table(p_collection text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE p_collection
    WHEN 'customers' THEN 'entity_customers'
    WHEN 'sites' THEN 'entity_sites'
    WHEN 'areas' THEN 'entity_areas'
    WHEN 'workRequired' THEN 'entity_project_work'
    WHEN 'measurementRevisions' THEN 'entity_site_records'
    WHEN 'quotations' THEN 'entity_commercial_documents'
    WHEN 'acceptedScopes' THEN 'entity_project_work'
    WHEN 'workOrders' THEN 'entity_project_work'
    WHEN 'boqs' THEN 'entity_commercial_documents'
    WHEN 'vendorRfqs' THEN 'entity_commercial_documents'
    WHEN 'vendorBids' THEN 'entity_commercial_documents'
    WHEN 'purchaseOrders' THEN 'entity_commercial_documents'
    WHEN 'grns' THEN 'entity_commercial_documents'
    WHEN 'inventory' THEN 'entity_inventory'
    WHEN 'stockMovements' THEN 'entity_stockMovements'
    WHEN 'dispatches' THEN 'entity_commercial_documents'
    WHEN 'vendorBills' THEN 'entity_financial_documents'
    WHEN 'vendorPayments' THEN 'entity_money_movements'
    WHEN 'contractorBills' THEN 'entity_financial_documents'
    WHEN 'contractorPayments' THEN 'entity_money_movements'
    WHEN 'commissions' THEN 'entity_financial_documents'
    WHEN 'workOrderCostLines' THEN 'entity_workOrderCostLines'
    WHEN 'contractorBids' THEN 'entity_commercial_documents'
    WHEN 'contractorSettlements' THEN 'entity_commercial_documents'
    WHEN 'drawings' THEN 'entity_site_records'
    WHEN 'executionLogs' THEN 'entity_site_records'
    WHEN 'variationRequests' THEN 'entity_site_records'
    WHEN 'visits' THEN 'entity_workflow_controls'
    WHEN 'tasks' THEN 'entity_workflow_controls'
    WHEN 'followups' THEN 'entity_workflow_controls'
    WHEN 'actions' THEN 'entity_workflow_controls'
    WHEN 'payments' THEN 'entity_financial_documents'
    WHEN 'invoices' THEN 'entity_financial_documents'
    WHEN 'customerReceipts' THEN 'entity_money_movements'
    WHEN 'blocked' THEN 'entity_workflow_controls'
    WHEN 'risks' THEN 'entity_workflow_controls'
    WHEN 'threads' THEN 'entity_threads'
    WHEN 'attendance' THEN 'entity_staff_records'
    WHEN 'staffRolePermissions' THEN 'entity_staffRolePermissions'
    WHEN 'leaveRequests' THEN 'entity_staff_records'
    WHEN 'payrollPeriods' THEN 'entity_financial_documents'
    WHEN 'payrollLines' THEN 'entity_staff_records'
    WHEN 'salaryAdjustments' THEN 'entity_staff_records'
    WHEN 'staffDocuments' THEN 'entity_staff_records'
    WHEN 'approvalPolicies' THEN 'entity_policy_rules'
    WHEN 'automationRules' THEN 'entity_policy_rules'
    WHEN 'recurringTasks' THEN 'entity_policy_rules'
    WHEN 'commSends' THEN 'entity_commSends'
    WHEN 'entityFileAttachments' THEN 'entity_resource_links'
    WHEN 'entityReferenceAssignments' THEN 'entity_resource_links'
    WHEN 'commercialTerms' THEN 'entity_commercial_settings'
    WHEN 'paymentTermTemplates' THEN 'entity_commercial_settings'
    WHEN 'taxConfigs' THEN 'entity_commercial_settings'
    WHEN 'validityConfigs' THEN 'entity_commercial_settings'
    WHEN 'auditLog' THEN 'entity_auditLog'
    WHEN 'master.units' THEN 'entity_master_units'
    WHEN 'master.workCategories' THEN 'entity_work_definitions'
    WHEN 'master.workSubcategories' THEN 'entity_work_definitions'
    WHEN 'master.articles' THEN 'entity_catalogue_items'
    WHEN 'master.articleVariants' THEN 'entity_catalogue_items'
    WHEN 'master.subcategoryArticleMap' THEN 'entity_master_subcategoryArticleMap'
    WHEN 'master.workOptionGroups' THEN 'entity_work_definitions'
    WHEN 'master.workOptionValues' THEN 'entity_work_definitions'
    WHEN 'master.vendors' THEN 'entity_master_vendors'
    WHEN 'master.contractors' THEN 'entity_master_contractors'
    WHEN 'master.staff' THEN 'entity_master_staff'
    WHEN 'master.sourcePartners' THEN 'entity_master_sourcePartners'
    WHEN 'master.commissionRules' THEN 'entity_policy_rules'
    WHEN 'master.vendorRates' THEN 'entity_rate_cards'
    WHEN 'master.contractorRates' THEN 'entity_rate_cards'
    WHEN 'master.customerRateSuggestions' THEN 'entity_rate_cards'
    WHEN 'master.vendorRateHistories' THEN 'entity_rate_cards'
    WHEN 'master.storageAccounts' THEN 'entity_master_storageAccounts'
    WHEN 'master.storageFolderTemplates' THEN 'entity_storage_structure'
    WHEN 'master.storageFolderInstances' THEN 'entity_storage_structure'
    WHEN 'master.fileAssets' THEN 'entity_master_fileAssets'
    WHEN 'master.catalogues' THEN 'entity_reference_libraries'
    WHEN 'master.catalogueArticleVendorLinks' THEN 'entity_resource_links'
    WHEN 'master.pinterestBoards' THEN 'entity_reference_libraries'
    WHEN 'master.referenceMedia' THEN 'entity_reference_libraries'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.uc_expand_contractor_rate_operations(p_workspace_id text, p_operations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_op jsonb;
  v_row jsonb;
  v_projected_row jsonb;
  v_id text;
  v_contractor_id text;
  v_affected_ids text[] := array[]::text[];
  v_deleted_contractor_ids text[] := array[]::text[];
  v_projection_ids text[] := array[]::text[];
  v_rate_delete_ids text[] := array[]::text[];
  v_projection_rows jsonb := '[]'::jsonb;
  v_contractor_projection jsonb;
  v_output jsonb := '[]'::jsonb;
  v_existing_id text;
  v_has_rate_operation boolean := false;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';
  end if;

  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' = 'master.contractorRates' then
      v_has_rate_operation := true;
      continue;
    end if;
    if v_op ->> 'collection' <> 'master.contractors' then
      continue;
    end if;

    for v_row in select value from jsonb_array_elements(coalesce(v_op -> 'upsert', '[]'::jsonb))
    loop
      v_contractor_id := nullif(btrim(coalesce(v_row ->> 'id', '')), '');
      if v_contractor_id is null then continue; end if;
      if not (v_contractor_id = any(v_affected_ids)) then
        v_affected_ids := array_append(v_affected_ids, v_contractor_id);
      end if;

      v_contractor_projection := public.uc_contractor_rate_projection_rows(
        p_workspace_id,
        v_row
      );
      v_projection_rows := v_projection_rows || v_contractor_projection;

      for v_projected_row in select value from jsonb_array_elements(v_contractor_projection)
      loop
        v_id := nullif(btrim(coalesce(v_projected_row ->> 'id', '')), '');
        if v_id is not null and not (v_id = any(v_projection_ids)) then
          v_projection_ids := array_append(v_projection_ids, v_id);
        end if;
      end loop;

      for v_existing_id in
        select r.id
          from (SELECT * FROM public."entity_rate_cards" WHERE collection='master.contractorRates') r
         where r.workspace_id = p_workspace_id
           and r.data ->> 'contractor_id' = v_contractor_id
      loop
        if not (v_existing_id = any(v_projection_ids))
           and not (v_existing_id = any(v_rate_delete_ids)) then
          v_rate_delete_ids := array_append(v_rate_delete_ids, v_existing_id);
        end if;
      end loop;
    end loop;

    for v_id in select value #>> '{}' from jsonb_array_elements(coalesce(v_op -> 'deleteIds', '[]'::jsonb))
    loop
      v_contractor_id := nullif(btrim(coalesce(v_id, '')), '');
      if v_contractor_id is null then continue; end if;
      if not (v_contractor_id = any(v_affected_ids)) then
        v_affected_ids := array_append(v_affected_ids, v_contractor_id);
      end if;
      if not (v_contractor_id = any(v_deleted_contractor_ids)) then
        v_deleted_contractor_ids := array_append(v_deleted_contractor_ids, v_contractor_id);
      end if;

      for v_existing_id in
        select r.id
          from (SELECT * FROM public."entity_rate_cards" WHERE collection='master.contractorRates') r
         where r.workspace_id = p_workspace_id
           and r.data ->> 'contractor_id' = v_contractor_id
      loop
        if not (v_existing_id = any(v_rate_delete_ids)) then
          v_rate_delete_ids := array_append(v_rate_delete_ids, v_existing_id);
        end if;
      end loop;
    end loop;
  end loop;

  if cardinality(v_affected_ids) = 0 then
    if v_has_rate_operation then
      raise exception using errcode = '22023', message = 'CONTRACTOR_RATES_READ_ONLY';
    end if;
    return p_operations;
  end if;

  -- Contractor Rates are projection output, never caller input. Preserve every
  -- non-rate operation and discard any supplied rate upserts/deletes.
  for v_op in select value from jsonb_array_elements(p_operations)
  loop
    if v_op ->> 'collection' = 'master.contractorRates' then
      continue;
    end if;
    v_output := v_output || jsonb_build_array(v_op);
  end loop;

  v_output := v_output || jsonb_build_array(jsonb_build_object(
    'collection', 'master.contractorRates',
    'table', 'entity_rate_cards',
    'upsert', v_projection_rows,
    'deleteIds', to_jsonb(v_rate_delete_ids)
  ));

  return v_output;
end;
$function$;


CREATE OR REPLACE FUNCTION public.uc_contractor_rate_projection_rows(p_workspace_id text, p_contractor jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows jsonb := '[]'::jsonb;
  v_capability jsonb;
  v_work_type_rate jsonb;
  v_contractor_id text := nullif(btrim(coalesce(p_contractor ->> 'id', '')), '');
  v_subcategory_id text;
  v_subcategory_name text;
  v_work_type_id text;
  v_work_type_name text;
  v_unit_id text;
  v_material jsonb;
  v_labour jsonb;
  v_total numeric;
begin
  if v_contractor_id is null then return v_rows; end if;

  for v_capability in
    select value from jsonb_array_elements(
      case when jsonb_typeof(p_contractor -> 'work_capabilities') = 'array'
        then p_contractor -> 'work_capabilities' else '[]'::jsonb end
    )
  loop
    v_subcategory_id := nullif(btrim(coalesce(v_capability ->> 'subcategory_id', '')), '');
    if v_subcategory_id is null then continue; end if;
    v_subcategory_name := nullif(btrim(coalesce(v_capability ->> 'subcategory_name', '')), '');

    for v_work_type_rate in
      select value from jsonb_array_elements(
        case when jsonb_typeof(v_capability -> 'work_type_rates') = 'array'
          then v_capability -> 'work_type_rates' else '[]'::jsonb end
      )
    loop
      v_work_type_id := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_id', '')), '');
      v_work_type_name := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_name', '')), '');
      v_material := nullif(v_work_type_rate -> 'material_rate', 'null'::jsonb);
      v_labour := nullif(v_work_type_rate -> 'labour_rate', 'null'::jsonb);
      if v_work_type_id is null or v_work_type_name is null or (v_material is null and v_labour is null) then continue; end if;

      v_unit_id := coalesce(
        nullif(btrim(v_work_type_rate ->> 'unit_id'), ''),
        (
          select nullif(btrim(work_type.value ->> 'unit_id'), '')
            from (SELECT * FROM public."entity_work_definitions" WHERE collection='master.workSubcategories') subcategory
            cross join lateral jsonb_array_elements(
              case when jsonb_typeof(subcategory.data -> 'work_types') = 'array'
                then subcategory.data -> 'work_types' else '[]'::jsonb end
            ) as work_type(value)
           where subcategory.workspace_id = p_workspace_id
             and subcategory.id = v_subcategory_id
             and work_type.value ->> 'id' = v_work_type_id
           limit 1
        ),
        (
          select nullif(btrim(subcategory.data ->> 'unit_id'), '')
            from (SELECT * FROM public."entity_work_definitions" WHERE collection='master.workSubcategories') subcategory
           where subcategory.workspace_id = p_workspace_id
             and subcategory.id = v_subcategory_id
           limit 1
        )
      );
      v_total := coalesce((v_material #>> '{}')::numeric, 0) + coalesce((v_labour #>> '{}')::numeric, 0);

      v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', 'crate-' || v_contractor_id || '-' || v_subcategory_id || '-' || v_work_type_id,
        'contractor_id', v_contractor_id,
        'trade', coalesce(v_subcategory_name, 'Contractor rate') || ' · ' || v_work_type_name,
        'rate', v_total,
        'unit_id', v_unit_id,
        'work_subcategory_id', v_subcategory_id,
        'work_subcategory_name', v_subcategory_name,
        'work_type_id', v_work_type_id,
        'work_type_name', v_work_type_name,
        'material_rate', v_material,
        'labour_rate', v_labour,
        'notes', nullif(btrim(v_work_type_rate ->> 'notes'), '')
      )));
    end loop;
  end loop;

  return v_rows;
end;
$function$;


NOTIFY pgrst,'reload schema';
COMMIT;
