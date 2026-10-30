-- One canonical source for partner figures and Contractor rates.
BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE public.entity_workspace_revision,public.entity_master_contractors,public.entity_master_vendors,public.entity_rate_cards IN ACCESS EXCLUSIVE MODE;
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
    v_subcategory_name := coalesce((SELECT nullif(btrim(s.data->>'name'),'') FROM public.entity_work_definitions s
      WHERE s.workspace_id=p_workspace_id AND s.collection='master.workSubcategories' AND s.id=v_subcategory_id),v_subcategory_name);

    for v_work_type_rate in
      select value from jsonb_array_elements(
        case when jsonb_typeof(v_capability -> 'work_type_rates') = 'array'
          then v_capability -> 'work_type_rates' else '[]'::jsonb end
      )
    loop
      v_work_type_id := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_id', '')), '');
      v_work_type_name := nullif(btrim(coalesce(v_work_type_rate ->> 'work_type_name', '')), '');
      v_work_type_name := coalesce((SELECT nullif(btrim(w.value->>'name'),'') FROM public.entity_work_definitions s
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'work_types')='array' THEN s.data->'work_types' ELSE '[]'::jsonb END) w(value)
        WHERE s.workspace_id=p_workspace_id AND s.collection='master.workSubcategories' AND s.id=v_subcategory_id AND w.value->>'id'=v_work_type_id LIMIT 1),v_work_type_name);
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


CREATE VIEW public.entity_contractor_rate_read WITH (security_invoker=true) AS
SELECT 'master.contractorRates'::text AS collection, c.workspace_id, r->>'id' AS id,
 c.revision,c.updated_at,c.updated_by,r AS data
FROM public.entity_master_contractors c
CROSS JOIN LATERAL jsonb_array_elements(public.uc_contractor_rate_projection_rows(c.workspace_id,c.data)) r;
REVOKE ALL ON public.entity_contractor_rate_read FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.entity_contractor_rate_read TO service_role;
DO $guard$
BEGIN
 IF EXISTS ((SELECT workspace_id,id,data - 'trade' - 'work_subcategory_name' - 'work_type_name' FROM public.entity_rate_cards WHERE collection='master.contractorRates'
 EXCEPT SELECT workspace_id,id,data - 'trade' - 'work_subcategory_name' - 'work_type_name' FROM public.entity_contractor_rate_read)
 UNION ALL (SELECT workspace_id,id,data - 'trade' - 'work_subcategory_name' - 'work_type_name' FROM public.entity_contractor_rate_read
 EXCEPT SELECT workspace_id,id,data - 'trade' - 'work_subcategory_name' - 'work_type_name' FROM public.entity_rate_cards WHERE collection='master.contractorRates')) THEN
 RAISE EXCEPTION 'CANONICAL_RATE_PROJECTION_MISMATCH'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.uc_expand_contractor_rate_operations(p_workspace_id text, p_operations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE op jsonb; row_data jsonb; cleaned jsonb; output jsonb := '[]';
BEGIN
 IF jsonb_typeof(p_operations) <> 'array' THEN RAISE EXCEPTION 'INVALID_OPERATIONS' USING ERRCODE='22023'; END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
  IF op->>'collection'='master.contractorRates' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_operations) x WHERE x->>'collection'='master.contractors') THEN
    RAISE EXCEPTION 'CONTRACTOR_RATES_READ_ONLY' USING ERRCODE='22023';
   END IF;
   CONTINUE;
  END IF;
  IF op->>'collection' IN ('master.vendors','master.contractors') AND op ? 'upsert' THEN
   cleaned := '[]';
   FOR row_data IN SELECT value FROM jsonb_array_elements(op->'upsert') LOOP
    row_data := row_data - 'outstanding';
    IF op->>'collection'='master.contractors' THEN row_data := row_data - 'active_jobs'; END IF;
    cleaned := cleaned || jsonb_build_array(row_data);
   END LOOP;
   op := jsonb_set(op,'{upsert}',cleaned);
  END IF;
  output := output || jsonb_build_array(op);
 END LOOP;
 RETURN output;
END $fn$;
REVOKE ALL ON FUNCTION public.uc_expand_contractor_rate_operations(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.uc_expand_contractor_rate_operations(text,jsonb) TO service_role;
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
    WHEN 'master.contractorRates' THEN 'entity_contractor_rate_read'
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

-- Use the existing atomic revision/CAS/journal machinery for removed master fields.
DO $cleanup$
DECLARE ws text; ops jsonb; current_revision integer;
BEGIN
 FOR ws IN SELECT DISTINCT workspace_id FROM (SELECT workspace_id FROM public.entity_master_contractors WHERE data ?| array['outstanding','active_jobs']
 UNION SELECT workspace_id FROM public.entity_master_vendors WHERE data ? 'outstanding') w LOOP
  SELECT jsonb_agg(op) INTO ops FROM (
   SELECT jsonb_build_object('collection','master.contractors','table','entity_master_contractors','upsert',jsonb_agg(data - 'outstanding' - 'active_jobs')) op
   FROM public.entity_master_contractors WHERE workspace_id=ws AND data ?| array['outstanding','active_jobs'] HAVING count(*)>0
   UNION ALL SELECT jsonb_build_object('collection','master.vendors','table','entity_master_vendors','upsert',jsonb_agg(data - 'outstanding'))
   FROM public.entity_master_vendors WHERE workspace_id=ws AND data ? 'outstanding' HAVING count(*)>0
  ) changes;
  SELECT revision INTO current_revision FROM public.entity_workspace_revision WHERE id=ws FOR UPDATE;
  PERFORM public.commit_workspace_operations(ws,current_revision,ops);
 END LOOP;
END $cleanup$;
DELETE FROM public.entity_rate_cards WHERE collection='master.contractorRates';
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.entity_rate_cards ADD CONSTRAINT uc_contractor_rates_virtual CHECK(collection <> 'master.contractorRates');
ALTER TABLE public.entity_master_vendors ADD CONSTRAINT uc_vendor_no_derived_balance CHECK (NOT data ? 'outstanding');
ALTER TABLE public.entity_master_contractors ADD CONSTRAINT uc_contractor_no_derived_summary CHECK (NOT data ?| array['outstanding','active_jobs']);
CREATE FUNCTION public.uc_validate_canonical_rate_units() RETURNS trigger
LANGUAGE plpgsql SET search_path='public','pg_temp' AS $fn$
BEGIN
 IF EXISTS (SELECT 1 FROM public.entity_contractor_rate_read r
  WHERE (TG_TABLE_NAME <> 'entity_master_contractors' OR (r.workspace_id=NEW.workspace_id AND r.data->>'contractor_id'=NEW.id))
   AND nullif(r.data->>'unit_id','') IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.entity_master_units u WHERE u.workspace_id=r.workspace_id AND u.id=r.data->>'unit_id')) THEN
  RAISE EXCEPTION 'CANONICAL_RATE_UNIT_REFERENCE' USING ERRCODE='23503';
 END IF;
 RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.uc_validate_canonical_rate_units() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER uc_contractor_rate_unit_reference AFTER INSERT OR UPDATE ON public.entity_master_contractors
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.uc_validate_canonical_rate_units();
CREATE CONSTRAINT TRIGGER uc_unit_canonical_rate_reference AFTER DELETE OR UPDATE ON public.entity_master_units
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.uc_validate_canonical_rate_units();

NOTIFY pgrst,'reload schema';
COMMIT;
