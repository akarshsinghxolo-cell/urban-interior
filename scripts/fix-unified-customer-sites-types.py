from pathlib import Path

path = Path("src/components/rdash/CustomerSitesDialog.tsx")
text = path.read_text()
old_import = 'import { reserveEntityId } from "@/lib/uploads/upload-types";\n'
new_import = 'import { reserveEntityId, type UploadBatchId } from "@/lib/uploads/upload-types";\n'
if text.count(old_import) != 1:
    raise SystemExit("Upload type import anchor not found exactly once")
text = text.replace(old_import, new_import, 1)
old_type = '  registerBatch: (batchId: string) => void;\n'
new_type = '  registerBatch: (batchId: UploadBatchId) => UploadBatchId;\n'
if text.count(old_type) != 1:
    raise SystemExit("registerBatch type anchor not found exactly once")
text = text.replace(old_type, new_type, 1)
path.write_text(text)

path = Path("src/components/rdash/EntityFormDialog.tsx")
text = path.read_text()
selectors = '''    const createCustomerWithFirstSite = useRDashStore((s) => s.createCustomerWithFirstSite);
    const addVendor = useRDashStore((s) => s.addVendor);
    const addContractor = useRDashStore((s) => s.addContractor);
    const updateCustomer = useRDashStore((s) => s.updateCustomer);
    const updateVendor = useRDashStore((s) => s.updateVendor);
    const updateContractor = useRDashStore((s) => s.updateContractor);
    const updateSite = useRDashStore((s) => s.updateSite);
'''
replacement_selectors = '''    const saveCustomerWithSites = useRDashStore((s) => s.saveCustomerWithSites);
    const addVendor = useRDashStore((s) => s.addVendor);
    const addContractor = useRDashStore((s) => s.addContractor);
    const updateVendor = useRDashStore((s) => s.updateVendor);
    const updateContractor = useRDashStore((s) => s.updateContractor);
'''
if text.count(selectors) != 1:
    raise SystemExit("Legacy EntityFormDialog selector block not found exactly once")
text = text.replace(selectors, replacement_selectors, 1)
old_update = '''                if (isEditMode && editId) {
                    updateCustomer(editId, customerPayload);
                    toast.success(`Customer "${name.trim()}" updated`);
                    onSaved?.(editId);
                }
                else {
'''
new_update = '''                if (isEditMode && editId) {
                    const result = saveCustomerWithSites({ customerId: editId, customer: customerPayload, sites: [] });
                    toast.success(`Customer "${name.trim()}" updated`);
                    onSaved?.(result.customerId);
                }
                else {
'''
if text.count(old_update) != 1:
    raise SystemExit("Legacy customer update branch not found exactly once")
text = text.replace(old_update, new_update, 1)
old_create = '''                    const result = createCustomerWithFirstSite(customerPayload, addFirstSite ? {
                        id: reservedFirstSiteId,
                        name: firstSiteName.trim(),
                        building_name: firstSiteBuildingName.trim() || undefined,
                        site_type: firstSiteType,
                        stage: "enquiry",
                        address: firstSiteAddress.trim() || undefined,
                        city: firstSiteCity.trim() || undefined,
                        locality: firstSiteLocality.trim() || undefined,
                        latitude: firstSiteLat,
                        longitude: firstSiteLng,
                        map_url: firstSiteMapUrl.trim() || undefined,
                        notes: firstSiteNotes.trim() || undefined,
                        photo_attachment_ids: firstSitePhotos.map((photo) => photo.attachmentId),
                        source_partner_id: referralId,
                        source_partner_name: referralName,
                    } : undefined);
'''
new_create = '''                    const result = saveCustomerWithSites({
                        customer: customerPayload,
                        sites: addFirstSite ? [{
                            id: reservedFirstSiteId,
                            name: firstSiteName.trim(),
                            building_name: firstSiteBuildingName.trim() || undefined,
                            site_type: firstSiteType,
                            stage: "enquiry",
                            address: firstSiteAddress.trim() || undefined,
                            city: firstSiteCity.trim() || undefined,
                            locality: firstSiteLocality.trim() || undefined,
                            latitude: firstSiteLat,
                            longitude: firstSiteLng,
                            map_url: firstSiteMapUrl.trim() || undefined,
                            notes: firstSiteNotes.trim() || undefined,
                            photo_attachment_ids: firstSitePhotos.map((photo) => photo.attachmentId),
                            source_partner_id: referralId,
                            source_partner_name: referralName,
                        }] : [],
                    });
'''
if text.count(old_create) != 1:
    raise SystemExit("Legacy customer create branch not found exactly once")
text = text.replace(old_create, new_create, 1)
path.write_text(text)
