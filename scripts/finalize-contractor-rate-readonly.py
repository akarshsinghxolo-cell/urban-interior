from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    target = Path(path)
    text = target.read_text()
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}")
    target.write_text(result)


authorized = "src/lib/rdash/server/authorized-commit.ts"
regex_once(
    authorized,
    r'''function canonicalizeContractorRateOperations\(\n  current: RDashDatabase,\n  operations: WorkspaceOperation\[\],\n\): WorkspaceOperation\[\] \{.*?\n\}\n\nfunction audit''',
    '''function canonicalizeContractorRateOperations(\n  current: RDashDatabase,\n  operations: WorkspaceOperation[],\n): WorkspaceOperation[] {\n  const contractorOperation = operations.find((operation) => operation.collection === "master.contractors");\n  const hasRateOperation = operations.some((operation) => operation.collection === "master.contractorRates");\n  if (!contractorOperation) {\n    if (hasRateOperation) {\n      throw new Error("INVALID:Contractor Rates are read-only projections. Update Contractor work capabilities instead.");\n    }\n    return operations;\n  }\n\n  // Caller-supplied rate rows are never authoritative. Apply only the\n  // Contractor/profile operations, then rebuild rate rows from canonical\n  // work_capabilities for every touched Contractor.\n  const profileOperations = operations.filter((operation) => operation.collection !== "master.contractorRates");\n  const candidate = applyWorkspaceOperations(current, profileOperations);\n  let contractorRates = current.master.contractorRates || [];\n  const touchedIds = new Set<string>();\n  for (const row of contractorOperation.upsert || []) {\n    const id = String(row.id || "").trim();\n    if (id) touchedIds.add(id);\n  }\n  for (const id of contractorOperation.deleteIds || []) {\n    if (id) touchedIds.add(id);\n  }\n\n  for (const contractorId of touchedIds) {\n    const contractor = candidate.master.contractors.find((row) => row.id === contractorId);\n    if (!contractor) {\n      contractorRates = contractorRates.filter((rate) => rate.contractor_id !== contractorId);\n      continue;\n    }\n    contractorRates = contractorRateProjection(\n      { master: { ...candidate.master, contractorRates } },\n      contractor,\n    );\n  }\n\n  const canonical: RDashDatabase = {\n    ...candidate,\n    master: { ...candidate.master, contractorRates },\n  };\n  return diffWorkspaceOperations(current, canonical);\n}\n\nfunction audit''',
)

migration = "supabase/migrations/20260808120000_remove_contractor_legacy_rate_compatibility.sql"
regex_once(
    migration,
    r'''create or replace function public\.uc_expand_contractor_rate_operations\(\n  p_workspace_id text,\n  p_operations jsonb\n\)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp\nas \$function\$.*?\n\$function\$;''',
    '''create or replace function public.uc_expand_contractor_rate_operations(\n  p_workspace_id text,\n  p_operations jsonb\n)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp\nas $function$\ndeclare\n  v_op jsonb;\n  v_row jsonb;\n  v_projected_row jsonb;\n  v_id text;\n  v_contractor_id text;\n  v_affected_ids text[] := array[]::text[];\n  v_deleted_contractor_ids text[] := array[]::text[];\n  v_projection_ids text[] := array[]::text[];\n  v_rate_delete_ids text[] := array[]::text[];\n  v_projection_rows jsonb := '[]'::jsonb;\n  v_contractor_projection jsonb;\n  v_output jsonb := '[]'::jsonb;\n  v_existing_id text;\n  v_has_rate_operation boolean := false;\nbegin\n  if jsonb_typeof(p_operations) <> 'array' then\n    raise exception using errcode = '22023', message = 'INVALID_OPERATIONS';\n  end if;\n\n  for v_op in select value from jsonb_array_elements(p_operations)\n  loop\n    if v_op ->> 'collection' = 'master.contractorRates' then\n      v_has_rate_operation := true;\n      continue;\n    end if;\n    if v_op ->> 'collection' <> 'master.contractors' then\n      continue;\n    end if;\n\n    for v_row in select value from jsonb_array_elements(coalesce(v_op -> 'upsert', '[]'::jsonb))\n    loop\n      v_contractor_id := nullif(btrim(coalesce(v_row ->> 'id', '')), '');\n      if v_contractor_id is null then continue; end if;\n      if not (v_contractor_id = any(v_affected_ids)) then\n        v_affected_ids := array_append(v_affected_ids, v_contractor_id);\n      end if;\n\n      v_contractor_projection := public.uc_contractor_rate_projection_rows(\n        p_workspace_id,\n        v_row\n      );\n      v_projection_rows := v_projection_rows || v_contractor_projection;\n\n      for v_projected_row in select value from jsonb_array_elements(v_contractor_projection)\n      loop\n        v_id := nullif(btrim(coalesce(v_projected_row ->> 'id', '')), '');\n        if v_id is not null and not (v_id = any(v_projection_ids)) then\n          v_projection_ids := array_append(v_projection_ids, v_id);\n        end if;\n      end loop;\n\n      for v_existing_id in\n        select r.id\n          from public."entity_master_contractorRates" r\n         where r.workspace_id = p_workspace_id\n           and r.data ->> 'contractor_id' = v_contractor_id\n      loop\n        if not (v_existing_id = any(v_projection_ids))\n           and not (v_existing_id = any(v_rate_delete_ids)) then\n          v_rate_delete_ids := array_append(v_rate_delete_ids, v_existing_id);\n        end if;\n      end loop;\n    end loop;\n\n    for v_id in select value #>> '{}' from jsonb_array_elements(coalesce(v_op -> 'deleteIds', '[]'::jsonb))\n    loop\n      v_contractor_id := nullif(btrim(coalesce(v_id, '')), '');\n      if v_contractor_id is null then continue; end if;\n      if not (v_contractor_id = any(v_affected_ids)) then\n        v_affected_ids := array_append(v_affected_ids, v_contractor_id);\n      end if;\n      if not (v_contractor_id = any(v_deleted_contractor_ids)) then\n        v_deleted_contractor_ids := array_append(v_deleted_contractor_ids, v_contractor_id);\n      end if;\n\n      for v_existing_id in\n        select r.id\n          from public."entity_master_contractorRates" r\n         where r.workspace_id = p_workspace_id\n           and r.data ->> 'contractor_id' = v_contractor_id\n      loop\n        if not (v_existing_id = any(v_rate_delete_ids)) then\n          v_rate_delete_ids := array_append(v_rate_delete_ids, v_existing_id);\n        end if;\n      end loop;\n    end loop;\n  end loop;\n\n  if cardinality(v_affected_ids) = 0 then\n    if v_has_rate_operation then\n      raise exception using errcode = '22023', message = 'CONTRACTOR_RATES_READ_ONLY';\n    end if;\n    return p_operations;\n  end if;\n\n  -- Contractor Rates are projection output, never caller input. Preserve every\n  -- non-rate operation and discard any supplied rate upserts/deletes.\n  for v_op in select value from jsonb_array_elements(p_operations)\n  loop\n    if v_op ->> 'collection' = 'master.contractorRates' then\n      continue;\n    end if;\n    v_output := v_output || jsonb_build_array(v_op);\n  end loop;\n\n  v_output := v_output || jsonb_build_array(jsonb_build_object(\n    'collection', 'master.contractorRates',\n    'table', 'entity_master_contractorRates',\n    'upsert', v_projection_rows,\n    'deleteIds', to_jsonb(v_rate_delete_ids)\n  ));\n\n  return v_output;\nend;\n$function$;''',
)
replace_once(
    migration,
    "  'Replaces every rate row for a touched Contractor with the canonical work_capabilities projection; free-form legacy rates are not preserved.';\n",
    "  'Makes Contractor Rates a read-only projection: direct rate operations are rejected unless accompanied by Contractor changes, and caller-supplied rate rows are discarded in favor of canonical work_capabilities.';\n",
)

server_test = "tests/contractor-legacy-removal.test.ts"
replace_once(
    server_test,
    '''    expect(detail).toContain("contractorRateProjection(db, c)");\n  });\n''',
    '''    expect(detail).toContain("contractorRateProjection(db, c)");\n  });\n\n  test("Contractor Rates are read-only at the server commit boundary", async () => {\n    const server = await source("src/lib/rdash/server/authorized-commit.ts");\n    expect(server).toContain("Contractor Rates are read-only projections");\n    expect(server).toContain('operations.filter((operation) => operation.collection !== "master.contractorRates")');\n    expect(server).toContain("contractorRateProjection(");\n  });\n''',
)

db_test = "tests/supabase-data-convergence-contractor-cleanup.test.ts"
replace_once(
    db_test,
    '''    expect(migration).toContain("free-form legacy rates are not preserved");\n  });\n''',
    '''    expect(migration).toContain("CONTRACTOR_RATES_READ_ONLY");\n    expect(migration).toContain("v_has_rate_operation boolean := false");\n    expect(migration).not.toContain("v_preserved_rate_rows");\n    expect(migration).toContain("caller-supplied rate rows are discarded");\n  });\n''',
)

workflow = Path(".github/workflows/application-ci.yml")
workflow_text = workflow.read_text()
for marker in ("RATE-READONLY-CHECKOUT", "RATE-READONLY-APPLY", "RATE-READONLY-COMMIT"):
    start = f"      # {marker}-BEGIN\n"
    end = f"      # {marker}-END\n"
    if start not in workflow_text or end not in workflow_text:
        raise RuntimeError(f"Missing workflow marker {marker}")
    before, remainder = workflow_text.split(start, 1)
    _, after = remainder.split(end, 1)
    workflow_text = before + after
workflow.write_text(workflow_text)

print("Contractor Rates sealed as read-only projection at server and database boundaries.")
