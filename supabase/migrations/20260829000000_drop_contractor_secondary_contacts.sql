-- Drop secondary contact fields from Contractor master records.
--
-- The contractor add/edit form no longer collects WhatsApp, alternate phone
-- or email. The application layer (normalizeContractorForWrite in
-- src/lib/rdash/contractor-profile.ts) strips these keys from every write,
-- and the Contractor type no longer declares them.
--
-- Contractors are stored as JSONB payloads (entity_master_contractors.data),
-- so removal happens on the JSON documents — there are no dedicated columns
-- for these fields.

begin;

update public."entity_master_contractors"
set data = data - 'whatsapp' - 'alternate_phone' - 'email',
    revision = revision + 1,
    updated_at = now()
where data ?| array['whatsapp', 'alternate_phone', 'email'];

commit;
