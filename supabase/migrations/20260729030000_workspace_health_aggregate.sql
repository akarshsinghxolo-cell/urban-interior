create table if not exists public.workspace_health_snapshot (
  workspace_id text primary key,
  workspace_revision bigint not null default 0,
  health_score integer not null default 100,
  total_issues integer not null default 0,
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  info_count integer not null default 0,
  total_records bigint not null default 0,
  total_references bigint not null default 0,
  business_rule_issues integer not null default 0,
  report_json jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.get_workspace_health_summary(p_workspace_id text default 'default')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
clock as (
  select (now() at time zone 'Asia/Kolkata')::date as today,
         date_trunc('month', now() at time zone 'Asia/Kolkata')::date as month_start
),
rev as (
  select coalesce((select revision from public.entity_workspace_revision where id = p_workspace_id), 0) as revision
),
task_metrics as (
  select
    count(*) filter (where data->>'status' in ('todo','in_progress','review')) as open_tasks,
    count(*) filter (where data->>'status' in ('todo','in_progress','review') and nullif(data->>'due_date','') < (select today::text from clock)) as overdue_tasks,
    count(*) filter (where data->>'status' in ('todo','in_progress','review') and data->>'due_date' = (select today::text from clock)) as due_today_tasks
  from public."entity_tasks" where workspace_id = p_workspace_id
),
followup_metrics as (
  select count(*) filter (where data->>'status' in ('pending','scheduled','missed')) as active_followups
  from public."entity_followups" where workspace_id = p_workspace_id
),
action_metrics as (
  select count(*) filter (where data->>'status' = 'pending') as pending_approvals
  from public."entity_actions" where workspace_id = p_workspace_id
),
blocked_metrics as (
  select count(*) filter (where coalesce((data->>'resolved')::boolean, false) = false) as unresolved_blocked
  from public."entity_blocked" where workspace_id = p_workspace_id
),
risk_metrics as (
  select count(*) as open_risks from public."entity_risks" where workspace_id = p_workspace_id
),
work_order_metrics as (
  select count(*) filter (where data->>'status' in ('in_progress','scheduled')) as active_work_orders
  from public."entity_workOrders" where workspace_id = p_workspace_id
),
visit_metrics as (
  select count(*) filter (where data->>'status' in ('scheduled','en_route','checked_in')) as active_visits
  from public."entity_visits" where workspace_id = p_workspace_id
),
customer_metrics as (
  select count(*) as customers from public."entity_customers" where workspace_id = p_workspace_id
),
quotation_current as (
  select distinct on (coalesce(nullif(data->>'parent_quotation_id',''), id)) data
  from public."entity_quotations"
  where workspace_id = p_workspace_id
  order by coalesce(nullif(data->>'parent_quotation_id',''), id),
 coalesce(nullif(data->>'revision_no','')::integer, 0) desc,
 coalesce(data->>'updated_at', data->>'created_at', '') desc
),
quotation_metrics as (
  select
    count(*) filter (where data->>'status' in ('draft','sent')) as pipeline_quotations,
    coalesce(sum(case when data->>'status' in ('draft','sent') and coalesce(data->>'total_amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (data->>'total_amount')::numeric else 0 end), 0) as pipeline_value,
    count(*) filter (where data->>'revision_kind' in ('variation','renegotiation')) as variations
  from quotation_current
),
po_metrics as (
  select count(*) filter (where coalesce((data->>'direct_award')::boolean, false) or data->>'award_basis' = 'direct') as direct_award_pos
  from public."entity_purchaseOrders" where workspace_id = p_workspace_id
),
receipt_metrics as (
  select
    coalesce(sum(case when coalesce(data->>'amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (data->>'amount')::numeric else 0 end), 0) as total_received,
    coalesce(sum(case when left(coalesce(data->>'received_at',''), 10) >= (select month_start::text from clock) and coalesce(data->>'amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (data->>'amount')::numeric else 0 end), 0) as month_revenue
  from public."entity_customerReceipts" where workspace_id = p_workspace_id
),
vendor_payment_metrics as (
  select coalesce(sum(case when coalesce(data->>'amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (data->>'amount')::numeric else 0 end), 0) as total_paid_out
  from public."entity_vendorPayments" where workspace_id = p_workspace_id
),
invoice_metrics as (
  select
    count(*) filter (where data->>'status' in ('issued','partial','overdue') and nullif(data->>'due_date','') < (select today::text from clock)) as overdue_invoice_count,
    coalesce(sum(case when data->>'status' in ('issued','partial','overdue') and nullif(data->>'due_date','') < (select today::text from clock) and coalesce(data->>'balance_amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (data->>'balance_amount')::numeric else 0 end), 0) as overdue_invoice_value
  from public."entity_invoices" where workspace_id = p_workspace_id
),
vendor_bill_metrics as (
  select
    count(*) filter (where data->>'status' in ('pending','approved','partly_paid')) as pending_vendor_bill_count,
    coalesce(sum(case when data->>'status' in ('pending','approved','partly_paid') and coalesce(data->>'balance_amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (data->>'balance_amount')::numeric else 0 end), 0) as pending_vendor_bill_value
  from public."entity_vendorBills" where workspace_id = p_workspace_id
),
attention as (
  select (tm.overdue_tasks + am.pending_approvals + bm.unresolved_blocked + rm.open_risks)::bigint as count
  from task_metrics tm, action_metrics am, blocked_metrics bm, risk_metrics rm
),
integrity as (
  select * from public.workspace_health_snapshot where workspace_id = p_workspace_id
),
recent_activity as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'action', data->>'action',
    'kind', data->>'kind',
    'entityType', data->>'entity_type',
    'entityLabel', coalesce(data->>'entity_label', data->>'entity_type'),
    'actor', coalesce(data->>'actor','system'),
    'actorRole', data->>'actor_role',
    'sourceModule', data->>'source_module',
    'reason', data->>'reason',
    'timestamp', data->>'timestamp'
  ) order by data->>'timestamp' desc), '[]'::jsonb) as rows
  from (
    select id, data from public."entity_auditLog"
    where workspace_id = p_workspace_id
    order by data->>'timestamp' desc
    limit 5
  ) latest
),
revenue_series as (
  select jsonb_agg(jsonb_build_object('date', day::text, 'value', value) order by day) as rows
  from (
    select d.day,
      coalesce(sum(case when left(coalesce(r.data->>'received_at',''), 10) = d.day::text and coalesce(r.data->>'amount','') ~ '^-?[0-9]+(\.[0-9]+)?$' then (r.data->>'amount')::numeric else 0 end), 0) as value
    from generate_series((select today from clock) - 6, (select today from clock), interval '1 day') d(day)
    left join public."entity_customerReceipts" r on r.workspace_id = p_workspace_id and left(coalesce(r.data->>'received_at',''), 10) = d.day::date::text
    group by d.day
  ) values_by_day
)
select jsonb_build_object(
  'revision', (select revision from rev),
  'healthBadge', case
    when not exists(select 1 from integrity) then 'watch'
    when (select count from attention) = 0 and (select health_score from integrity) >= 95 then 'healthy'
    when (select count from attention) <= 3 and (select health_score from integrity) >= 80 then 'watch'
    else 'attention'
  end,
  'attentionCount', (select count from attention),
  'integrity', jsonb_build_object(
    'snapshotAvailable', exists(select 1 from integrity),
    'healthScore', coalesce((select health_score from integrity), 100),
    'totalIssues', coalesce((select total_issues from integrity), 0),
    'critical', coalesce((select critical_count from integrity), 0),
    'warning', coalesce((select warning_count from integrity), 0),
    'info', coalesce((select info_count from integrity), 0),
    'totalRecords', coalesce((select total_records from integrity), 0),
    'totalReferences', coalesce((select total_references from integrity), 0),
    'businessRuleIssues', coalesce((select business_rule_issues from integrity), 0),
    'calculatedAt', (select calculated_at from integrity)
  ),
  'operations', jsonb_build_object(
    'openTasks', (select open_tasks from task_metrics),
    'overdueTasks', (select overdue_tasks from task_metrics),
    'dueTodayTasks', (select due_today_tasks from task_metrics),
    'activeFollowups', (select active_followups from followup_metrics),
    'pendingApprovals', (select pending_approvals from action_metrics),
    'unresolvedBlocked', (select unresolved_blocked from blocked_metrics),
    'openRisks', (select open_risks from risk_metrics),
    'activeWorkOrders', (select active_work_orders from work_order_metrics),
    'activeVisits', (select active_visits from visit_metrics)
  ),
  'commercial', jsonb_build_object(
    'pipelineValue', (select pipeline_value from quotation_metrics),
    'pipelineQuotations', (select pipeline_quotations from quotation_metrics),
    'customers', (select customers from customer_metrics)
  ),
  'exceptions', jsonb_build_object(
    'directAwardPOs', (select direct_award_pos from po_metrics),
    'variations', (select variations from quotation_metrics),
    'total', (select direct_award_pos from po_metrics) + (select variations from quotation_metrics)
  ),
  'finance', jsonb_build_object(
    'cashPosition', (select total_received from receipt_metrics) - (select total_paid_out from vendor_payment_metrics),
    'monthRevenue', (select month_revenue from receipt_metrics),
    'overdueInvoiceValue', (select overdue_invoice_value from invoice_metrics),
    'overdueInvoiceCount', (select overdue_invoice_count from invoice_metrics),
    'pendingVendorBillValue', (select pending_vendor_bill_value from vendor_bill_metrics),
    'pendingVendorBillCount', (select pending_vendor_bill_count from vendor_bill_metrics),
    'totalReceived', (select total_received from receipt_metrics),
    'totalPaidOut', (select total_paid_out from vendor_payment_metrics),
    'revenueSeries', (select rows from revenue_series)
  ),
  'recentActivity', (select rows from recent_activity)
);
$$;

revoke all on function public.get_workspace_health_summary(text) from public;
grant execute on function public.get_workspace_health_summary(text) to service_role;
