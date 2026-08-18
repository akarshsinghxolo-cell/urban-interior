-- Customer Roles were an abandoned UI-only concept.
-- Remove the key from canonical Customer JSON so the database matches the application model.
update public.entity_customers
set data = data - 'customer_segments'
where data ? 'customer_segments';
