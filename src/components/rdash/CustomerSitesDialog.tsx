"use client";

import * as React from "react";
import { Building2, Pencil, Plus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRDashStore } from "@/lib/rdash/store";
import { findCustomerIdentityMatches, findSameNameCustomers } from "@/lib/rdash/customer-identity";
import { coordinateInputError } from "@/lib/rdash/coordinates";
import { cancelQueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { dirtyFormRegistry } from "@/lib/rdash/dirty-form-registry";
import { useDirtyFormRegistration } from "@/lib/rdash/use-dirty-form-guard";
import { CustomerDetailsFields } from "./CustomerDetailsFields";
import { CustomerSiteDraftCard } from "./CustomerSiteDraftCard";
import {
  customerPayload,
  defaultSiteName,
  draftForCustomer,
  draftForSite,
  emptyCustomerDraft,
  fingerprint,
  newSiteDraft,
  siteNameFollowsCustomer,
  sitePayload,
  validEmail,
  validIndianPhone,
  type CustomerDraft,
  type SiteDraft,
} from "./customer-sites-form-model";

function scrollToField(id: string) {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (element instanceof HTMLElement) element.focus({ preventScroll: true });
  });
}

export function CustomerSitesDialog({
  open,
  onClose,
  editId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editId?: string;
  onSaved?: (customerId: string) => void;
}) {
  const db = useRDashStore((state) => state.db);
  const saveCustomerWithSites = useRDashStore((state) => state.saveCustomerWithSites);
  const awaitServerSync = useRDashStore((state) => state.awaitServerSync);
  const currentUser = useRDashStore((state) => state.currentUser);
  const isEdit = Boolean(editId);
  const [saving, setSaving] = React.useState(false);
  const [customer, setCustomer] = React.useState<CustomerDraft>(() => emptyCustomerDraft());
  const [sites, setSites] = React.useState<SiteDraft[]>([]);
  const [detachAttachmentIds, setDetachAttachmentIds] = React.useState<string[]>([]);
  const [baseline, setBaseline] = React.useState("");
  const [sameNameAcknowledged, setSameNameAcknowledged] = React.useState(false);
  const { registerBatch, commitBatches } = useUploadDraft(open);
  const formId = `customer-sites:${editId || "new"}`;
  const initializedKeyRef = React.useRef<string | null>(null);
  const previousCustomerNameRef = React.useRef("");

  const initialise = React.useCallback(() => {
    const existing = editId ? db.customers.find((row) => row.id === editId) : undefined;
    const nextCustomer = existing ? draftForCustomer(existing) : emptyCustomerDraft();
    const nextSites = existing
      ? db.sites.filter((site) => site.customer_id === existing.id && !site.is_archived).map(draftForSite)
      : [];
    previousCustomerNameRef.current = nextCustomer.name;
    setCustomer(nextCustomer);
    setSites(nextSites);
    setDetachAttachmentIds([]);
    setSameNameAcknowledged(false);
    setBaseline(fingerprint(nextCustomer, nextSites, [], false));
    dirtyFormRegistry.markClean(formId);
  }, [db.customers, db.sites, editId, formId]);

  React.useEffect(() => {
    if (!open) {
      initializedKeyRef.current = null;
      return;
    }
    const key = editId || "new";
    if (initializedKeyRef.current === key) return;
    initializedKeyRef.current = key;
    initialise();
  }, [editId, initialise, open]);

  React.useEffect(() => {
    if (!open) return;
    const previousCustomerName = previousCustomerNameRef.current;
    if (previousCustomerName === customer.name) return;
    const nextDefaultName = defaultSiteName(customer.name);
    setSites((current) => current.map((site) => siteNameFollowsCustomer(site, previousCustomerName)
      ? { ...site, name: nextDefaultName }
      : site));
    previousCustomerNameRef.current = customer.name;
  }, [customer.name, open]);

  const currentFingerprint = React.useMemo(
    () => fingerprint(customer, sites, detachAttachmentIds, sameNameAcknowledged),
    [customer, sites, detachAttachmentIds, sameNameAcknowledged],
  );
  const dirty = open && currentFingerprint !== baseline;

  const updateSite = React.useCallback((siteId: string, patch: Partial<SiteDraft>) => {
    setSites((current) => current.map((site) => site.id === siteId ? { ...site, ...patch } : site));
  }, []);

  const removeNewSite = React.useCallback(async (siteId: string) => {
    const site = sites.find((row) => row.id === siteId);
    if (!site || site.existing) return;
    await Promise.all(site.pendingPhotos.map((photo) => cancelQueuedWorkflowFile(photo)));
    setSites((current) => current.filter((row) => row.id !== siteId));
  }, [sites]);

  const setNewSiteEnabled = React.useCallback(async (siteId: string, enabled: boolean) => {
    const site = sites.find((row) => row.id === siteId);
    if (!site || site.existing) return;
    if (!enabled && site.pendingPhotos.length) {
      await Promise.all(site.pendingPhotos.map((photo) => cancelQueuedWorkflowFile(photo)));
    }
    updateSite(siteId, {
      enabled,
      expanded: enabled || site.expanded,
      pendingPhotos: enabled ? site.pendingPhotos : [],
    });
  }, [sites, updateSite]);

  const duplicateMatches = React.useMemo(() => findCustomerIdentityMatches(db.customers, {
    phone: customer.phone,
    whatsapp: customer.whatsapp || customer.phone,
    alternate_phone: customer.alternatePhone,
    email: customer.email,
  }, { excludeCustomerId: editId }), [customer.alternatePhone, customer.email, customer.phone, customer.whatsapp, db.customers, editId]);

  const sameNameMatches = React.useMemo(
    () => findSameNameCustomers(db.customers, { name: customer.name }, { excludeCustomerId: editId }),
    [customer.name, db.customers, editId],
  );

  const formIsValid = React.useMemo(() => {
    if (!customer.name.trim()) return false;
    if (![customer.phone, customer.whatsapp, customer.alternatePhone].every(validIndianPhone)) return false;
    if (!validEmail(customer.email) || duplicateMatches.length) return false;
    if (sameNameMatches.length && !sameNameAcknowledged) return false;
    return sites.filter((site) => site.existing || site.enabled).every((site) => {
      if (site.archiveRequested) return Boolean(site.archiveReason.trim());
      return Boolean(site.name.trim()) && !coordinateInputError(site.coordinateInput);
    });
  }, [customer, duplicateMatches.length, sameNameAcknowledged, sameNameMatches.length, sites]);

  const validate = React.useCallback(() => {
    if (!customer.name.trim()) {
      toast.error("Customer name is required");
      scrollToField("customer-name");
      return false;
    }
    if (![customer.phone, customer.whatsapp, customer.alternatePhone].every(validIndianPhone)) {
      toast.error("Every entered mobile number must contain 10 digits and start with 6, 7, 8, or 9");
      scrollToField("customer-phone");
      return false;
    }
    if (!validEmail(customer.email)) {
      toast.error("Enter a valid email address");
      scrollToField("customer-email");
      return false;
    }
    if (duplicateMatches.length) {
      toast.error(`Existing customer found: ${duplicateMatches.map((match) => match.customer.name).join(", ")}`);
      scrollToField("customer-phone");
      return false;
    }
    if (sameNameMatches.length && !sameNameAcknowledged) {
      toast.error("Review the same-name customer warning before creating a separate record");
      scrollToField("same-name-warning");
      return false;
    }
    for (const site of sites.filter((row) => row.existing || row.enabled)) {
      if (site.archiveRequested) {
        if (!site.archiveReason.trim()) {
          updateSite(site.id, { expanded: true });
          toast.error(`Enter an archive reason for ${site.name || "the Site"}`);
          scrollToField(`site-archive-reason-${site.id}`);
          return false;
        }
        continue;
      }
      if (!site.name.trim()) {
        updateSite(site.id, { expanded: true });
        toast.error("Enter a Site name or remove/switch off that new Site");
        scrollToField(`site-name-${site.id}`);
        return false;
      }
      const coordinateError = coordinateInputError(site.coordinateInput);
      if (coordinateError) {
        updateSite(site.id, { expanded: true });
        toast.error(`${site.name || "Site"}: ${coordinateError}`);
        scrollToField(`site-coordinates-${site.id}`);
        return false;
      }
    }
    return true;
  }, [customer, duplicateMatches, sameNameAcknowledged, sameNameMatches.length, sites, updateSite]);

  const persist = React.useCallback(async (): Promise<boolean> => {
    if (saving || !dirty) return !dirty;
    if (!validate()) return false;
    try {
      setSaving(true);
      const includedSites = sites.filter((site) => site.existing || site.enabled);
      const result = saveCustomerWithSites({
        customerId: editId,
        customer: customerPayload(customer),
        sites: includedSites.map((site) => sitePayload(site, currentUser().name)),
        detachAttachmentIds,
      });
      await awaitServerSync();
      commitBatches();
      setBaseline(fingerprint(customer, sites, detachAttachmentIds, sameNameAcknowledged));
      dirtyFormRegistry.markClean(formId);
      const archivedCount = includedSites.filter((site) => site.archiveRequested).length;
      toast.success(result.changed
        ? archivedCount
          ? `Customer saved and ${archivedCount} Site${archivedCount === 1 ? "" : "s"} archived`
          : `Customer \"${customer.name.trim()}\" and Site changes saved`
        : "No customer or Site changes to save");
      onSaved?.(result.customerId);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Customer and Sites could not be saved");
      return false;
    } finally {
      setSaving(false);
    }
  }, [awaitServerSync, commitBatches, currentUser, customer, detachAttachmentIds, dirty, editId, formId, onSaved, sameNameAcknowledged, saveCustomerWithSites, saving, sites, validate]);

  useDirtyFormRegistration({
    id: formId,
    label: isEdit ? "Edit Customer and Sites" : "Add Customer and Sites",
    dirty,
    save: persist,
    discard: () => {
      initialise();
      return true;
    },
  });

  const requestClose = React.useCallback(() => {
    dirtyFormRegistry.requestNavigation(onClose, {
      reason: isEdit ? "close the Customer and Sites editor" : "close the new Customer and Sites form",
    });
  }, [isEdit, onClose]);

  const openExistingCustomer = (customerId: string) => {
    dirtyFormRegistry.requestNavigation(() => {
      onSaved?.(customerId);
      onClose();
    }, { reason: "open the existing customer record" });
  };

  const saveAndClose = async () => {
    const saved = await persist();
    if (saved) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <DialogContent className="max-h-[94vh] max-w-4xl gap-0 overflow-hidden p-0">
        <form onSubmit={(event) => { event.preventDefault(); void saveAndClose(); }}>
          <DialogHeader className="border-b border-border px-5 py-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              {isEdit ? <Pencil className="h-4 w-4 text-primary" /> : <UserPlus className="h-4 w-4 text-primary" />}
              {isEdit ? "Edit Customer and Sites" : "Add New Customer"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Save customer identity and any number of optional Sites in one workflow. Site GPS, stage, files, and archive actions are validated.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-4 rd-scroll">
            <CustomerDetailsFields
              db={db}
              customer={customer}
              setCustomer={setCustomer}
              isEdit={isEdit}
              duplicateMatches={duplicateMatches}
              sameNameMatches={sameNameMatches}
              sameNameAcknowledged={sameNameAcknowledged}
              setSameNameAcknowledged={setSameNameAcknowledged}
              openExistingCustomer={openExistingCustomer}
            />

            <section className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><div><h3 className="text-sm font-semibold">Sites</h3><p className="text-[11px] text-muted-foreground">Sites are optional. New Sites default to “{defaultSiteName(customer.name) || "Customer Name Site"}”.</p></div></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setSites((current) => [...current, newSiteDraft(customer.name)])}><Plus className="mr-1 h-3.5 w-3.5" />Add Site</Button>
              </div>
              {sites.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-5 text-center">
                  <p className="text-sm font-medium">No Site added</p><p className="mt-1 text-xs text-muted-foreground">The customer can be saved without a Site.</p>
                  <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setSites([newSiteDraft(customer.name)])}><Plus className="mr-1 h-3.5 w-3.5" />Add first Site</Button>
                </div>
              )}
              {sites.map((site, index) => (
                <CustomerSiteDraftCard
                  key={site.id}
                  db={db}
                  draft={site}
                  index={index}
                  registerBatch={registerBatch}
                  onChange={(patch) => updateSite(site.id, patch)}
                  onToggleEnabled={(enabled) => void setNewSiteEnabled(site.id, enabled)}
                  onRemoveNew={() => void removeNewSite(site.id)}
                  onDetachExisting={(attachmentId) => {
                    setDetachAttachmentIds((current) => [...new Set([...current, attachmentId])]);
                    updateSite(site.id, { photoAttachmentIds: site.photoAttachmentIds.filter((id) => id !== attachmentId) });
                  }}
                />
              ))}
            </section>
          </div>

          <DialogFooter className="border-t border-border px-5 py-3">
            <Button type="button" variant="outline" size="sm" onClick={requestClose}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>
            <Button type="submit" size="sm" disabled={!dirty || saving || !formIsValid}>
              {saving ? "Saving and confirming…" : isEdit ? <><Pencil className="mr-1 h-3.5 w-3.5" />Save changes</> : <><Plus className="mr-1 h-3.5 w-3.5" />Create customer</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
