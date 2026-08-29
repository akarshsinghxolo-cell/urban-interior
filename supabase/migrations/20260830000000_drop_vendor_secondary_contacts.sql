-- Drop secondary contact fields from Vendor master records.
--
-- The vendor add/edit form no longer collects WhatsApp, alternate phone
-- or email. The application layer (normalizeVendorForWrite in
-- src/lib/rdash/vendor-profile.ts) strips these keys from every write,
-- and the Vendor type no longer declares them.
--
-- Vendors are stored as JSONB payloads (entity_master_vendors.data),
-- so removal happens on the JSON documents — there are no dedicated
-- columns for these fields.

begin;

update public."entity_master_vendors"
set data = data - 'whatsapp' - 'alternate_phone' - 'email',
    revision = revision + 1,
    updated_at = now()
where data ?| array['whatsapp', 'alternate_phone', 'email'];

commit;
