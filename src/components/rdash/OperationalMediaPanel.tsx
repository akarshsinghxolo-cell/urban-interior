"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import type { FileAttachmentEntityType, FileAttachmentRole, EntityReferenceAssignment, ReferenceResourceType, } from "@/lib/rdash/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FilePreview } from "./FilePreview";
import { resolveEntityContext, type EntityContext } from "@/lib/rdash/entity-context";
import { toast } from "sonner";
import { Archive, BookOpen, ExternalLink, FilePlus2, Image as ImageIcon, Link2, Paperclip, Pin, Send, Share2, Sparkles, Trash2, } from "lucide-react";
type Context = {
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    workRequiredId?: string;
    quotationId?: string;
    workOrderId?: string;
    siteId?: string;
    roomId?: string;
    vendorId?: string;
    articleIds: string[];
    variantIds: string[];
    categoryIds: string[];
    subcategoryIds: string[];
};
type ResourceCandidate = {
    type: ReferenceResourceType;
    id: string;
    title: string;
    url?: string;
    sendable: boolean;
    score: number;
    subtitle: string;
    fileId?: string;
};
const attachmentRoleOptions: Array<{
    value: FileAttachmentRole;
    label: string;
}> = [
    { value: "document", label: "Document" },
    { value: "photo", label: "Photo" },
    { value: "video", label: "Video" },
    { value: "drawing", label: "Drawing" },
    { value: "catalogue", label: "Catalogue" },
    { value: "invoice", label: "Invoice" },
    { value: "proof", label: "Proof / evidence" },
    { value: "measurement", label: "Measurement" },
    { value: "delivery", label: "Delivery proof" },
    { value: "bill", label: "Bill / receipt" },
    { value: "approval", label: "Approval" },
    { value: "other", label: "Other" },
];
function asText(value: unknown) {
    return typeof value === "string" ? value : "";
}
function unique(values: Array<string | undefined>) {
    return Array.from(new Set(values.filter(Boolean) as string[]));
}
function isShareableResource(candidate: ResourceCandidate) {
    return candidate.sendable && /^https?:\/\//.test(candidate.url || "");
}
function resourceIcon(type: ReferenceResourceType) {
    if (type === "catalogue")
        return <BookOpen className="h-3.5 w-3.5"/>;
    if (type === "pinterest_board")
        return <Pin className="h-3.5 w-3.5"/>;
    return <ImageIcon className="h-3.5 w-3.5"/>;
}
function resourceLabel(type: ReferenceResourceType) {
    if (type === "catalogue")
        return "Catalogue";
    if (type === "pinterest_board")
        return "Pinterest";
    return "Reference media";
}
function lineItemScope(db: any, context: EntityContext) {
    const fromItems = (items: any[] = []) => ({
        articleIds: unique(items.map((item) => item.article_id)),
        variantIds: unique(items.map((item) => item.variant_id)),
        categoryIds: unique(items.map((item) => item.category_id)),
        subcategoryIds: unique(items.map((item) => item.work_required_id)),
    });
    if (context.entityType === "workRequired") {
        const work = db.workRequired.find((row: any) => row.id === context.entityId);
        return { articleIds: [], variantIds: [], categoryIds: unique([work?.work_category_id]), subcategoryIds: unique(work?.work_subcategory_ids || []) };
    }
    if (context.entityType === "quotation" || context.entityType === "quotation_item") {
        const quotation = db.quotations.find((row: any) => row.id === context.quotationId);
        return fromItems(quotation?.scope_lines || quotation?.items || []);
    }
    if (context.entityType === "workOrder") {
        const workOrder = db.workOrders.find((row: any) => row.id === context.workOrderId);
        const quotation = db.quotations.find((row: any) => workOrder?.quotation_ids?.includes(row.id));
        return fromItems(quotation?.scope_lines || quotation?.items || []);
    }
    if (context.entityType === "boq" || context.entityType === "boq_item") {
        const boq = db.boqs.find((row: any) => row.id === context.entityId || row.items?.some((item: any) => item.id === context.entityId));
        return fromItems(boq?.items || []);
    }
    if (context.entityType === "purchase_order") {
        return fromItems(db.purchaseOrders.find((row: any) => row.id === context.purchaseOrderId)?.items || []);
    }
    if (context.entityType === "grn") {
        return fromItems(db.grns.find((row: any) => row.id === context.grnId)?.items || []);
    }
    if (context.entityType === "vendor_bill") {
        const po = db.purchaseOrders.find((row: any) => row.id === context.purchaseOrderId);
        return fromItems(po?.items || []);
    }
    if (context.entityType === "dispatch") {
        return fromItems(db.dispatches.find((row: any) => row.id === context.entityId)?.items || []);
    }
    if (context.entityType === "inventory") {
        const item = db.inventory.find((row: any) => row.id === context.entityId);
        return { ...fromItems([item]), articleIds: unique([item?.article_id]), variantIds: unique([item?.variant_id]), categoryIds: unique([item?.category_id]), subcategoryIds: unique([item?.work_required_id]) };
    }
    if (context.entityType === "execution_log") {
        const log = db.executionLogs.find((row: any) => row.id === context.entityId);
        return { articleIds: unique((log?.materials_used || []).map((item: any) => item.article_id)), variantIds: [], categoryIds: [], subcategoryIds: [] };
    }
    if (context.entityType === "task") {
        const quotation = db.quotations.find((row: any) => row.id === context.quotationId);
        return fromItems(quotation?.scope_lines || quotation?.items || []);
    }
    if (context.entityType === "payment" || context.entityType === "invoice") {
        const quotation = db.quotations.find((row: any) => row.id === context.quotationId);
        return fromItems(quotation?.scope_lines || quotation?.items || []);
    }
    if (context.entityType === "vendor_rate") {
        const rate = db.master.vendorRates.find((row: any) => row.id === context.entityId);
        const scope = db.master.subcategoryArticleMap.find((row: any) => row.id === rate?.work_required_article_id);
        const work = db.master.workSubcategories.find((row: any) => row.id === scope?.work_required_id);
        return { articleIds: unique([rate?.article_id, scope?.article_id]), variantIds: unique([rate?.variant_id]), categoryIds: unique([work?.category_id]), subcategoryIds: unique([scope?.work_required_id]) };
    }
    return { articleIds: [], variantIds: [], categoryIds: [], subcategoryIds: [] };
}
function entityContext(db: any, entityType: FileAttachmentEntityType, entityId: string): Context {
    const empty: Context = { articleIds: [], variantIds: [], categoryIds: [], subcategoryIds: [] };
    try {
        const resolved = resolveEntityContext(db, entityType, entityId, "Operational media");
        const customer = resolved.customerId ? db.customers.find((item: any) => item.id === resolved.customerId) : undefined;
        const scope = lineItemScope(db, resolved);
        return {
            ...empty,
            ...scope,
            customerId: resolved.customerId,
            customerName: customer?.name,
            customerPhone: customer?.whatsapp || customer?.phone,
            workRequiredId: resolved.workRequiredId,
            quotationId: resolved.quotationId,
            workOrderId: resolved.workOrderId,
            siteId: resolved.siteId,
            roomId: resolved.areaId,
            vendorId: resolved.vendorId,
        };
    }
    catch {
        return empty;
    }
}
function matchesScope(resource: any, context: Context) {
    let score = 0;
    const hasScope = Boolean(resource.category_id || resource.subcategory_id || resource.article_id || resource.variant_id);
    if (resource.variant_id) {
        if (!context.variantIds.includes(resource.variant_id))
            return -1;
        score += 40;
    }
    if (resource.article_id) {
        if (!context.articleIds.includes(resource.article_id))
            return -1;
        score += 30;
    }
    if (resource.subcategory_id) {
        if (!context.subcategoryIds.includes(resource.subcategory_id))
            return -1;
        score += 15;
    }
    if (resource.category_id) {
        if (!context.categoryIds.includes(resource.category_id))
            return -1;
        score += 10;
    }
    return hasScope ? score : 1;
}
function resolveResource(db: any, assignment: EntityReferenceAssignment): ResourceCandidate | null {
    if (assignment.resource_type === "catalogue") {
        const item = db.master.catalogues.find((row: any) => row.id === assignment.resource_id);
        const file = item?.drive_asset_id ? db.master.fileAssets.find((row: any) => row.id === item.drive_asset_id) : undefined;
        if (!item || item.status !== "active")
            return null;
        return { type: "catalogue", id: item.id, title: item.title, url: file?.web_view_link || item.catalog_url, sendable: item.sendable_to_customer !== false, score: 0, subtitle: item.catalog_type || "Catalogue", fileId: file?.id };
    }
    if (assignment.resource_type === "pinterest_board") {
        const item = db.master.pinterestBoards.find((row: any) => row.id === assignment.resource_id);
        if (!item || item.status !== "active")
            return null;
        return { type: "pinterest_board", id: item.id, title: item.title, url: item.board_url, sendable: item.sendable_to_customer !== false, score: 0, subtitle: "Pinterest board" };
    }
    const item = db.master.referenceMedia.find((row: any) => row.id === assignment.resource_id);
    const file = item?.drive_asset_id ? db.master.fileAssets.find((row: any) => row.id === item.drive_asset_id) : undefined;
    if (!item || item.status !== "active")
        return null;
    return { type: "reference_media", id: item.id, title: item.title, url: file?.web_view_link || item.media_url, sendable: item.sendable_to_customer !== false, score: 0, subtitle: "Reference media", fileId: file?.id };
}
export function OperationalMediaPanel({ entityType, entityId, title = "Files & references", compact = false, }: {
    entityType: FileAttachmentEntityType;
    entityId: string;
    title?: string;
    compact?: boolean;
}) {
    const db = useRDashStore((state) => state.db);
    const attachFileAsset = useRDashStore((state) => state.attachFileAsset);
    const createFileAssetAndAttach = useRDashStore((state) => state.createFileAssetAndAttach);
    const detachEntityFileAttachment = useRDashStore((state) => state.detachEntityFileAttachment);
    const assignReferenceResource = useRDashStore((state) => state.assignReferenceResource);
    const archiveReferenceAssignment = useRDashStore((state) => state.archiveReferenceAssignment);
    const sendComm = useRDashStore((state) => state.sendComm);
    const openDetail = useRDashStore((state) => state.openDetail);
    const [expanded, setExpanded] = React.useState(!compact);
    const [existingDriveId, setExistingDriveId] = React.useState("");
    const [showNewDrive, setShowNewDrive] = React.useState(false);
    const [fileDraft, setFileDraft] = React.useState({ name: "", url: "", role: "document" as FileAttachmentRole, visibility: "internal", customerShareable: false, tags: "" });
    const context = React.useMemo(() => entityContext(db, entityType, entityId), [db, entityType, entityId]);
    const attachments = (db.entityFileAttachments || [])
        .filter((item) => item.entity_type === entityType && item.entity_id === entityId)
        .map((item) => ({ attachment: item, file: db.master.fileAssets.find((file) => file.id === item.file_asset_id) }))
        .filter((item) => item.file?.status === "active");
    const assignments = (db.entityReferenceAssignments || [])
        .filter((item) => item.entity_type === entityType && item.entity_id === entityId && item.status === "active")
        .map((item) => ({ assignment: item, resource: resolveResource(db, item) }))
        .filter((item): item is {
        assignment: EntityReferenceAssignment;
        resource: ResourceCandidate;
    } => Boolean(item.resource));
    const candidates = React.useMemo(() => {
        const already = new Set(assignments.map(({ resource }) => `${resource.type}:${resource.id}`));
        const output: ResourceCandidate[] = [];
        const links = db.master.catalogueArticleVendorLinks || [];
        for (const catalogue of db.master.catalogues || []) {
            if (catalogue.status !== "active")
                continue;
            const file = catalogue.drive_asset_id ? db.master.fileAssets.find((row) => row.id === catalogue.drive_asset_id) : undefined;
            const relevantLinks = links.filter((link: any) => link.catalogue_id === catalogue.id && link.status === "active");
            const exact = relevantLinks.reduce((best: number, link: any) => {
                if (!context.articleIds.includes(link.article_id))
                    return best;
                if (link.variant_id && !context.variantIds.includes(link.variant_id))
                    return best;
                if (link.vendor_id && context.vendorId && link.vendor_id !== context.vendorId)
                    return best;
                return Math.max(best, 30 + (link.variant_id ? 20 : 0) + (link.vendor_id && link.vendor_id === context.vendorId ? 10 : 0));
            }, 0);
            if (!exact)
                continue;
            const candidate = { type: "catalogue" as const, id: catalogue.id, title: catalogue.title, url: file?.web_view_link || catalogue.catalog_url, sendable: catalogue.sendable_to_customer !== false, score: exact, subtitle: catalogue.catalog_type || "Catalogue", fileId: file?.id };
            if (!already.has(`${candidate.type}:${candidate.id}`))
                output.push(candidate);
        }
        for (const board of db.master.pinterestBoards || []) {
            if (board.status !== "active")
                continue;
            const score = matchesScope(board, context);
            if (score < 0)
                continue;
            const candidate = { type: "pinterest_board" as const, id: board.id, title: board.title, url: board.board_url, sendable: board.sendable_to_customer !== false, score, subtitle: "Pinterest board" };
            if (!already.has(`${candidate.type}:${candidate.id}`))
                output.push(candidate);
        }
        for (const media of db.master.referenceMedia || []) {
            if (media.status !== "active")
                continue;
            const score = matchesScope(media, context);
            if (score < 0)
                continue;
            const file = media.drive_asset_id ? db.master.fileAssets.find((row) => row.id === media.drive_asset_id) : undefined;
            const candidate = { type: "reference_media" as const, id: media.id, title: media.title, url: file?.web_view_link || media.media_url, sendable: media.sendable_to_customer !== false, score, subtitle: "Reference media", fileId: file?.id };
            if (!already.has(`${candidate.type}:${candidate.id}`))
                output.push(candidate);
        }
        return output.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 12);
    }, [db, context, assignments]);
    const attachExisting = () => {
        if (!existingDriveId)
            return toast.error("Choose a Drive file first");
        const id = attachFileAsset({ file_asset_id: existingDriveId, entity_type: entityType, entity_id: entityId, visibility: "internal" });
        if (!id)
            return toast.error("Drive file was not found");
        setExistingDriveId("");
        toast.success("Existing Drive file linked to this record");
    };
    const addNewDrive = (event: React.FormEvent) => {
        event.preventDefault();
        if (!fileDraft.name.trim() || !/^https?:\/\//.test(fileDraft.url.trim()))
            return toast.error("Enter file name and a valid link");
        // Operational files must be Google Drive links (enforced by createFileAssetAndAttach).
        // Validate client-side so we can show a friendly toast instead of an unhandled throw.
        if (!/^https:\/\/drive\.google\.com\//.test(fileDraft.url.trim()))
            return toast.error("Only Google Drive links are supported. Paste a https://drive.google.com/... URL.");
        try {
            createFileAssetAndAttach({ file_name: fileDraft.name.trim(), web_view_link: fileDraft.url.trim(), kind: fileDraft.role === "catalogue" ? "catalogue" : fileDraft.role === "drawing" ? "drawing" : fileDraft.role === "photo" || fileDraft.role === "video" ? "media" : fileDraft.role === "proof" ? "site_proof" : "document", tags: fileDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }, { entity_type: entityType, entity_id: entityId, role: fileDraft.role, visibility: fileDraft.visibility as any, customer_shareable: fileDraft.customerShareable });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Could not register the Drive file.";
            return toast.error(msg);
        }
        setFileDraft({ name: "", url: "", role: "document", visibility: "internal", customerShareable: false, tags: "" });
        setShowNewDrive(false);
        toast.success("Drive file registered once and linked to this record");
    };
    const assign = (candidate: ResourceCandidate) => {
        assignReferenceResource({
            resource_type: candidate.type,
            resource_id: candidate.id,
            entity_type: entityType,
            entity_id: entityId,
            customer_id: context.customerId,
            work_required_id: context.workRequiredId,
            quotation_id: context.quotationId,
            work_order_id: context.workOrderId,
            site_id: context.siteId,
            area_id: context.roomId,
            article_id: context.articleIds[0],
            variant_id: context.variantIds[0],
            vendor_id: context.vendorId,
            purpose: candidate.type === "catalogue" ? "catalogue" : entityType === "workOrder" || entityType === "execution_log" ? "execution_reference" : "design_reference",
        });
        toast.success(`${resourceLabel(candidate.type)} assigned to this record`);
    };
    const prepareCustomerShare = (subject: string, url?: string, channel: "catalogue" | "pinterest" | "reference" | "whatsapp" = "whatsapp") => {
        if (!context.customerId || !context.customerPhone || !url)
            return toast.error("A linked customer and a valid share URL are required");
        const message = `${subject}\n${url}`;
        const digits = context.customerPhone.replace(/\D/g, "");
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
        sendComm({ channel, customer_id: context.customerId, staff_name: "Owner", subject, body: message, status: "prepared" });
        toast.success("External WhatsApp draft opened and the share is logged as Prepared");
    };
    const assignAll = () => {
        if (!candidates.length)
            return toast.info("No matching catalogue, Pinterest board or reference media found");
        candidates.forEach(assign);
    };
    return (<section className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary"><Paperclip className="h-3.5 w-3.5"/></span>
          <div>
            <p className="text-xs font-bold">{title}</p>
            <p className="text-[10px] text-muted-foreground">Drive attachments are stored once; catalogue, Pinterest and media are assigned by context.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {candidates.length > 0 && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={assignAll}><Sparkles className="mr-1 h-3 w-3"/>Add {candidates.length} matches</Button>}
          {compact && <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setExpanded((value) => !value)}>{expanded ? "Collapse" : "Manage"}</Button>}
        </div>
      </div>

      {expanded && <div className="mt-3 space-y-3">
        <div className="rounded-md border border-border bg-background p-2.5">
          <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Drive files linked to this record</p><span className="text-[10px] text-muted-foreground">{attachments.length}</span></div>
          {attachments.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{attachments.map(({ attachment, file }) => <div key={attachment.id} className="min-w-0 rounded-md border border-border/70 p-1.5 text-xs"><FilePreview file={{ fileName: file?.file_name || attachment.caption || "Attached file", mimeType: file?.mime_type, googleFileId: file?.storage_mode === "managed" ? file.google_file_id : undefined, url: file?.web_view_link, thumbnailUrl: file?.thumbnail_url }} compact controls className="h-16"/><div className="mt-1 flex min-w-0 items-center gap-1"><p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{attachment.role}{attachment.caption ? ` · ${attachment.caption}` : ""}</p>{file?.id && <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Open media context" onClick={() => openDetail("media" as any, file.id)}><ExternalLink className="h-3.5 w-3.5"/></Button>}{attachment.customer_shareable && context.customerId && <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" title="Prepare customer share" onClick={() => prepareCustomerShare(file?.file_name || "Shared file", file?.web_view_link)}><Share2 className="h-3.5 w-3.5"/></Button>}<Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" title="Detach from this record" onClick={() => detachEntityFileAttachment(attachment.id)}><Trash2 className="h-3.5 w-3.5"/></Button></div></div>)}</div> : <p className="text-[11px] text-muted-foreground">No Drive file linked yet.</p>}
          <div className="mt-2 flex flex-wrap gap-1.5"><select value={existingDriveId} onChange={(event) => setExistingDriveId(event.target.value)} className="h-7 min-w-[190px] flex-1 rounded border border-input bg-card px-2 text-[11px]"><option value="">Attach existing Drive file…</option>{(db.master.fileAssets || []).filter((file) => file.status === "active" && !attachments.some((entry) => entry.file?.id === file.id)).map((file) => <option key={file.id} value={file.id}>{file.file_name}</option>)}</select><Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={attachExisting}><Link2 className="mr-1 h-3 w-3"/>Attach registered file</Button><Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setShowNewDrive((value) => !value)}><FilePlus2 className="mr-1 h-3 w-3"/>Register Drive link</Button></div>
          {showNewDrive && <form onSubmit={addNewDrive} className="mt-2 grid gap-1.5 rounded-md border border-primary/20 bg-primary/[0.03] p-2"><Input value={fileDraft.name} onChange={(event) => setFileDraft({ ...fileDraft, name: event.target.value })} placeholder="File name" className="h-8 text-xs"/><Input value={fileDraft.url} onChange={(event) => setFileDraft({ ...fileDraft, url: event.target.value })} placeholder="Existing Google Drive file or external URL" className="h-8 text-xs"/><div className="grid grid-cols-2 gap-1.5"><select value={fileDraft.role} onChange={(event) => setFileDraft({ ...fileDraft, role: event.target.value as FileAttachmentRole })} className="h-8 rounded border border-input bg-card px-2 text-xs">{attachmentRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select value={fileDraft.visibility} onChange={(event) => setFileDraft({ ...fileDraft, visibility: event.target.value })} className="h-8 rounded border border-input bg-card px-2 text-xs"><option value="internal">Internal</option><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="contractor">Contractor</option></select></div><Input value={fileDraft.tags} onChange={(event) => setFileDraft({ ...fileDraft, tags: event.target.value })} placeholder="Tags, comma separated" className="h-8 text-xs"/><label className="flex items-center gap-2 text-[11px]"><Checkbox checked={fileDraft.customerShareable} onCheckedChange={(value) => setFileDraft({ ...fileDraft, customerShareable: value === true })}/>Customer-shareable</label><div className="flex justify-end gap-1.5"><Button size="sm" variant="ghost" type="button" className="h-7 text-[11px]" onClick={() => setShowNewDrive(false)}>Cancel</Button><Button size="sm" type="submit" className="h-7 text-[11px]">Register link + attach</Button></div></form>}
        </div>

        <div className="rounded-md border border-border bg-background p-2.5">
          <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Assigned references</p><span className="text-[10px] text-muted-foreground">{assignments.length}</span></div>
          {assignments.length ? <div className="space-y-1.5">{assignments.map(({ assignment, resource }) => <div key={assignment.id} className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs"><span className="text-primary">{resourceIcon(resource.type)}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{resource.title}</p><p className="text-[10px] text-muted-foreground">{resourceLabel(resource.type)} · {assignment.purpose.replace(/_/g, " ")}</p></div>{resource.fileId && <Button size="icon" variant="ghost" className="h-6 w-6" title="Open media context" onClick={() => openDetail("media" as any, resource.fileId!)}><FilePlus2 className="h-3.5 w-3.5"/></Button>}{resource.url && <a href={resource.url} target="_blank" rel="noreferrer" className="rounded p-1 text-primary hover:bg-primary/10" aria-label={`Open ${resource.title}`}><ExternalLink className="h-3.5 w-3.5"/></a>}{isShareableResource(resource) && context.customerId && <Button size="icon" variant="ghost" className="h-6 w-6" title="Prepare customer share" onClick={() => prepareCustomerShare(resource.title, resource.url, resource.type === "catalogue" ? "catalogue" : resource.type === "pinterest_board" ? "pinterest" : "reference")}><Send className="h-3.5 w-3.5"/></Button>}<Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" title="Archive assignment" onClick={() => archiveReferenceAssignment(assignment.id)}><Archive className="h-3.5 w-3.5"/></Button></div>)}</div> : <p className="text-[11px] text-muted-foreground">No reusable catalogue, Pinterest board or reference media assigned yet.</p>}
        </div>

        <div className="rounded-md border border-dashed border-primary/30 bg-primary/[0.025] p-2.5">
          <div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary"><Sparkles className="h-3 w-3"/>Recommended from live context</p><span className="text-[10px] text-muted-foreground">{candidates.length}</span></div>
          {candidates.length ? <div className="space-y-1.5">{candidates.map((candidate) => <div key={`${candidate.type}-${candidate.id}`} className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs"><span className="text-primary">{resourceIcon(candidate.type)}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{candidate.title}</p><p className="text-[10px] text-muted-foreground">{candidate.subtitle} · relevance {candidate.score}</p></div>{candidate.fileId && <Button size="icon" variant="ghost" className="h-6 w-6" title="Open media context" onClick={() => openDetail("media" as any, candidate.fileId!)}><FilePlus2 className="h-3.5 w-3.5"/></Button>}{candidate.url && <a href={candidate.url} target="_blank" rel="noreferrer" className="rounded p-1 text-primary hover:bg-primary/10"><ExternalLink className="h-3.5 w-3.5"/></a>}<Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => assign(candidate)}>Assign</Button></div>)}</div> : <p className="text-[11px] text-muted-foreground">No direct match yet. Add an article/variant/vendor context or create a library record with a matching scope.</p>}
        </div>
      </div>}
    </section>);
}
export function ArticleVendorAssetLinks({ articleId, vendorId, variantId, title = "Linked catalogues" }: {
    articleId: string;
    vendorId?: string;
    variantId?: string;
    title?: string;
}) {
    const db = useRDashStore((state) => state.db);
    const setActiveModule = useRDashStore((state) => state.setActiveModule);
    const openDetail = useRDashStore((state) => state.openDetail);
    const matches = React.useMemo(() => {
        const links = (db.master.catalogueArticleVendorLinks || []).filter((link) => link.status === "active" && link.article_id === articleId && (!link.vendor_id || !vendorId || link.vendor_id === vendorId) && (!link.variant_id || !variantId || link.variant_id === variantId));
        const ids = new Set(links.map((link) => link.catalogue_id));
        return (db.master.catalogues || []).filter((catalogue) => ids.has(catalogue.id) && catalogue.status === "active").map((catalogue) => ({ catalogue, file: catalogue.drive_asset_id ? db.master.fileAssets.find((file) => file.id === catalogue.drive_asset_id) : undefined }));
    }, [db, articleId, vendorId, variantId]);
    if (!matches.length)
        return <span className="text-[10px] text-muted-foreground">No catalogue link</span>;
    return <div className="flex flex-wrap items-center gap-1.5"><span className="text-[10px] text-muted-foreground">{title}:</span>{matches.slice(0, 2).map(({ catalogue, file }) => file ? <button key={catalogue.id} type="button" className="w-12 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Open media context" onClick={() => openDetail("media" as any, file.id)}><FilePreview file={{ fileName: catalogue.title || file.file_name, mimeType: file.mime_type, googleFileId: file.storage_mode === "managed" ? file.google_file_id : undefined, url: file.web_view_link, thumbnailUrl: file.thumbnail_url }} compact controls className="h-12"/></button> : <a key={catalogue.id} href={catalogue.catalog_url || "#"} target="_blank" rel="noreferrer" className="inline-flex max-w-[150px] items-center gap-1 truncate rounded border border-primary/20 bg-primary/[0.04] px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10"><BookOpen className="h-3 w-3 shrink-0"/><span className="truncate">{catalogue.title}</span></a>)}{matches.length > 2 && <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px]" onClick={() => setActiveModule("mediaCommunication")}>+{matches.length - 2}</Button>}</div>;
}
