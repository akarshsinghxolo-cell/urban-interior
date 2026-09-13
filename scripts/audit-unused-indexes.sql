-- Read-only index audit for the Urban Castle Supabase database.
-- Run against production or a representative clone. Do not drop indexes solely
-- because idx_scan = 0.

with idx as (
  select
    n.nspname as schema_name,
    t.relname as table_name,
    i.relname as index_name,
    x.indexrelid,
    x.indrelid,
    x.indisunique,
    x.indisprimary,
    x.indkey,
    x.indnkeyatts,
    pg_get_expr(x.indpred, x.indrelid) as predicate,
    pg_get_expr(x.indexprs, x.indrelid) as expressions,
    am.amname,
    coalesce(s.idx_scan, 0) as idx_scan,
    pg_relation_size(i.oid) as bytes,
    coalesce(st.n_live_tup, 0) as live_rows,
    exists(select 1 from pg_constraint c where c.conindid = i.oid) as backs_constraint
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_am am on am.oid = i.relam
  left join pg_stat_user_indexes s on s.indexrelid = i.oid
  left join pg_stat_user_tables st on st.relid = t.oid
  where n.nspname = 'public'
)
select
  count(*) filter (where idx_scan = 0) as zero_scan_indexes,
  count(*) filter (where idx_scan = 0 and live_rows = 0) as zero_scan_on_empty_tables,
  count(*) filter (where idx_scan = 0 and live_rows > 0) as zero_scan_on_nonempty_tables,
  pg_size_pretty(sum(bytes) filter (where idx_scan = 0)) as zero_scan_size,
  count(*) filter (
    where idx_scan = 0 and (indisunique or indisprimary or backs_constraint)
  ) as protected_zero_scan,
  count(*) filter (
    where idx_scan = 0 and not (indisunique or indisprimary or backs_constraint)
  ) as nonconstraint_zero_scan
from idx;

with idx as (
  select
    n.nspname as schema_name,
    t.relname as table_name,
    i.relname as index_name,
    x.indisunique,
    x.indisprimary,
    pg_get_expr(x.indpred, x.indrelid) as predicate,
    pg_get_expr(x.indexprs, x.indrelid) as expressions,
    x.indkey::text as indkey,
    coalesce(s.idx_scan, 0) as idx_scan,
    pg_relation_size(i.oid) as bytes
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  left join pg_stat_user_indexes s on s.indexrelid = i.oid
  where n.nspname = 'public'
)
select
  a.schema_name,
  a.table_name,
  a.index_name,
  b.index_name as duplicate_of,
  a.idx_scan,
  b.idx_scan as duplicate_scan,
  a.bytes
from idx a
join idx b
  on a.schema_name = b.schema_name
 and a.table_name = b.table_name
 and a.index_name < b.index_name
 and a.indisunique = b.indisunique
 and a.indisprimary = b.indisprimary
 and coalesce(a.predicate, '') = coalesce(b.predicate, '')
 and coalesce(a.expressions, '') = coalesce(b.expressions, '')
 and a.indkey = b.indkey
order by a.bytes desc, a.table_name, a.index_name;

with idx as (
  select
    t.relname as table_name,
    i.relname as index_name,
    x.indexrelid,
    x.indrelid,
    x.indisunique,
    x.indisprimary,
    x.indkey,
    x.indnkeyatts,
    pg_get_expr(x.indpred, x.indrelid) as predicate,
    am.amname,
    coalesce(s.idx_scan, 0) as idx_scan,
    pg_relation_size(i.oid) as bytes,
    exists(select 1 from pg_constraint c where c.conindid = i.oid) as backs_constraint
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class t on t.oid = x.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_am am on am.oid = i.relam
  left join pg_stat_user_indexes s on s.indexrelid = i.oid
  where n.nspname = 'public'
)
select
  a.table_name,
  a.index_name as covered_index,
  b.index_name as covering_index,
  a.idx_scan as covered_scans,
  b.idx_scan as covering_scans,
  a.bytes as covered_bytes
from idx a
join idx b on b.indrelid = a.indrelid and b.indexrelid <> a.indexrelid
where a.amname = 'btree'
  and b.amname = 'btree'
  and not a.indisunique
  and not a.indisprimary
  and not a.backs_constraint
  and coalesce(a.predicate, '') = coalesce(b.predicate, '')
  and a.indnkeyatts < b.indnkeyatts
  and a.indkey::int2[] = (b.indkey::int2[])[1:a.indnkeyatts]
order by a.bytes desc, a.table_name, a.index_name;
