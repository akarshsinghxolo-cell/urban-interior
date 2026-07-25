"use client";
import * as React from "react";
import { Truck, PackageCheck, AlertTriangle, Boxes, FileCheck2, } from "lucide-react";
import { useRDashStore, inventoryValuation } from "@/lib/rdash/store";
import { OperationsWorkspace, type MetricSpec, type QueueSpec, type RecordRow, type FilterChip, } from "../OperationsWorkspace";
import { formatINR, formatINRShort, formatDate, grnStatusStyle, poStatusStyle, } from "@/lib/rdash/format";
import type { LineItem, PurchaseOrder } from "@/lib/rdash/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { cancelQueuedWorkflowFile, classifyWorkflowFile, enqueueWorkflowFiles, withLocalPreview, type QueuedWorkflowFile } from "@/lib/uploads/workflow-upload";
import { useUploadDraft } from "@/lib/uploads/use-upload-draft";
import { reserveEntityId } from "@/lib/uploads/upload-types";
import { FilePreview } from "../FilePreview";
import { attachedFileById, assetPreview } from "@/lib/rdash/file-attachments";
type PendingProof = QueuedWorkflowFile & {
    id: string;
    file_name: string;
    url: string;
    mime_type?: string;
    captured_at: string;
};
function genItemId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 6)}`;
}
export function GRNModule() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const verifyGRNReceipt = useRDashStore((s) => s.verifyGRNReceipt);
    const authUser = useRDashStore((s) => s.authUser);
    const [filter, setFilter] = React.useState<"all" | "matched" | "pending" | "verification" | "mismatched">("all");
    const [createOpen, setCreateOpen] = React.useState(false);
    const [preselectPOId, setPreselectPOId] = React.useState<string | null>(null);
    const total = db.grns.length;
    const matched = db.grns.filter((g) => g.status === "matched").length;
    const mismatched = db.grns.filter((g) => g.status === "mismatched").length;
    const pendingInvoiceMatch = db.grns.filter((g) => g.status === "received_pending_invoice_match").length;
    const pendingReceiptVerification = db.grns.filter((g) => g.status === "pending_receipt_verification").length;
    const stockValue = inventoryValuation(db);
    const metrics: MetricSpec[] = [
        { label: "Total GRNs", value: total, icon: <FileCheck2 className="h-4 w-4"/> },
        {
            label: "Matched",
            value: matched,
            tone: "success",
            icon: <PackageCheck className="h-4 w-4"/>,
        },
        {
            label: "Receipt verification",
            value: pendingReceiptVerification,
            tone: "warning",
            icon: <PackageCheck className="h-4 w-4"/>,
        },
        {
            label: "Invoice match pending",
            value: pendingInvoiceMatch,
            tone: "warning",
            icon: <PackageCheck className="h-4 w-4"/>,
        },
        {
            label: "Mismatched",
            value: mismatched,
            tone: "destructive",
            icon: <AlertTriangle className="h-4 w-4"/>,
        },
        {
            label: "Stock value",
            value: formatINRShort(stockValue),
            tone: "primary",
            icon: <Boxes className="h-4 w-4"/>,
        },
    ];
    const filterChips: FilterChip[] = [
        { id: "all", label: "All", count: total, active: filter === "all" },
        { id: "matched", label: "Matched", count: matched, active: filter === "matched" },
        { id: "verification", label: "Receipt verification", count: pendingReceiptVerification, active: filter === "verification" },
        { id: "pending", label: "Invoice match pending", count: pendingInvoiceMatch, active: filter === "pending" },
        {
            id: "mismatched",
            label: "Mismatched",
            count: mismatched,
            active: filter === "mismatched",
        },
    ];
    const onFilterChange = (id: string) => setFilter(id as typeof filter);
    const awaitingPOs = db.purchaseOrders.filter((p) => p.status === "sent" || p.status === "partially_received");
    const awaitingRows: RecordRow[] = awaitingPOs.map((po) => ({
        id: po.id,
        title: `${po.po_no} · ${po.vendor_name}`,
        subtitle: `${po.work_order_no || "—"} · ${po.items.length} items`,
        amount: po.total_amount,
        status: poStatusStyle(po.status),
        meta: `Expected ${formatDate(po.expected_delivery)}`,
        detailKind: "po" as const,
        contextActions: [
            {
                label: "Open PO",
                onClick: () => openDetail("po", po.id),
            },
            {
                label: "File GRN",
                onClick: () => {
                    setPreselectPOId(po.id);
                    setCreateOpen(true);
                },
                separatorBefore: true,
            },
        ],
    }));
    const recentGRNs = [...db.grns].sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    const grnRows: RecordRow[] = recentGRNs
        .filter((g) => filter === "all"
        ? true
        : filter === "pending"
            ? g.status === "received_pending_invoice_match"
            : filter === "verification"
                ? g.status === "pending_receipt_verification"
                : g.status === filter)
        .map((g) => ({
        id: g.id,
        title: `${g.grn_no} · ${g.vendor_name}`,
        subtitle: `Against ${g.po_no}`,
        status: grnStatusStyle(g.status),
        meta: `${g.items.length} items · ${formatDate(g.received_at)}`,
        detailKind: "grn" as const,
        badge: g.status === "mismatched" ? (<span className="rounded-full border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
            Obstacle
          </span>) : undefined,
        contextActions: g.status === "pending_receipt_verification" && ["Owner", "Operations Manager"].includes(authUser?.role || "")
            ? [{
                    label: "Verify receipt & post stock",
                    onClick: () => {
                        try {
                            verifyGRNReceipt(g.id);
                            toast.success(`${g.grn_no} verified and stock posted.`);
                        }
                        catch (error) {
                            toast.error(error instanceof Error ? error.message : "GRN receipt could not be verified.");
                        }
                    },
                }]
            : undefined,
    }));
    const queues: QueueSpec[] = [
        {
            title: "Awaiting GRN",
            icon: <Truck className="h-4 w-4 text-primary"/>,
            records: awaitingRows,
            emptyHint: "No POs awaiting delivery.",
            defaultOpen: true,
        },
        {
            title: "Recently Filed GRNs",
            icon: <FileCheck2 className="h-4 w-4 text-muted-foreground"/>,
            records: grnRows,
            emptyHint: "No GRNs filed yet.",
            defaultOpen: true,
        },
    ];
    const onCreate = () => {
        setPreselectPOId(null);
        setCreateOpen(true);
    };
    return (<>
      <OperationsWorkspace title="Delivery / GRN" description="Controlled material receiving against sent POs — proof, challan, inspection, stock, then vendor-invoice matching" icon={<Truck className="h-5 w-5"/>} workflow={["PO", "Delivery", "Count", "GRN", "Stock", "Bill"]} metrics={metrics} filterChips={filterChips} onFilterChange={onFilterChange} queues={queues} onCreate={onCreate} createLabel="File GRN" searchPlaceholder="Search GRNs / POs…"/>
      <FileGRNDialog open={createOpen} onOpenChange={setCreateOpen} preselectPOId={preselectPOId}/>
    </>);
}
function FileGRNDialog({ open, onOpenChange, preselectPOId, }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    preselectPOId: string | null;
}) {
    const db = useRDashStore((s) => s.db);
    const fileGRN = useRDashStore((s) => s.fileGRN);
    const openDetail = useRDashStore((s) => s.openDetail);
    const authUser = useRDashStore((s) => s.authUser);
    // CV-11: Use the actual signed-in user's name instead of the hardcoded "Ravi Kumar".
    // procurement.ts fileGRN ignores `received_by` from the input and uses `actor.name` (the
    // current user) for the GRN record. So we only need to fix the DISPLAY — the underlying
    // GRN record was always attributed to the real user; the dialog just lied about it.
    const receiverName = authUser?.name || "Staff";
    const eligiblePOs = db.purchaseOrders.filter((p) => p.status === "sent" || p.status === "partially_received");
    const [poId, setPoId] = React.useState<string>("");
    const [receivedQtys, setReceivedQtys] = React.useState<Record<string, number>>({});
    const [mismatchNotes, setMismatchNotes] = React.useState("");
    const [challanNo, setChallanNo] = React.useState("");
    const [inspectionStatus, setInspectionStatus] = React.useState<"accepted" | "accepted_with_observation" | "rejected">("accepted");
    const [inspectionNotes, setInspectionNotes] = React.useState("");
    const [batchSerialDetails, setBatchSerialDetails] = React.useState("");
    const [receivingProofs, setReceivingProofs] = React.useState<PendingProof[]>([]);
    const [challanProof, setChallanProof] = React.useState<PendingProof | undefined>();
    const [filing, setFiling] = React.useState(false);
    const [reservedGrnId, setReservedGrnId] = React.useState("");
    const { registerBatch, commitBatches } = useUploadDraft(open);
    React.useEffect(() => {
        if (open) {
            setPoId(preselectPOId || "");
            setReservedGrnId(reserveEntityId("grn"));
            setReceivedQtys({});
            setMismatchNotes("");
            setChallanNo("");
            setInspectionStatus("accepted");
            setInspectionNotes("");
            setBatchSerialDetails("");
            setReceivingProofs([]);
            setChallanProof(undefined);
        }
    }, [open, preselectPOId]);
    const selectedPO: PurchaseOrder | undefined = db.purchaseOrders.find((p) => p.id === poId);
    const items = selectedPO?.items || [];
    const receivedMap = items.reduce<Record<string, number>>((acc, it) => {
        acc[it.id] = receivedQtys[it.id] ?? it.quantity;
        return acc;
    }, {});
    const mismatched = items.some((it) => (receivedMap[it.id] ?? it.quantity) !== it.quantity);
    const captureProofs = async (event: React.ChangeEvent<HTMLInputElement>, target: "receiving" | "challan") => {
        const files = Array.from(event.target.files || []);
        event.currentTarget.value = "";
        if (!files.length || !reservedGrnId) return;
        try {
            if (target === "challan" && challanProof) await cancelQueuedWorkflowFile(challanProof);
            const queued = await enqueueWorkflowFiles({
                sourceFlow: "grn_form",
                sourceLabel: target === "receiving" ? "GRN receiving proof" : "GRN delivery challan",
                targetEntityType: "grn",
                targetEntityId: reservedGrnId,
                targetLabel: selectedPO ? `GRN · ${selectedPO.po_no}` : "New GRN",
                purpose: "grn_evidence",
                requiredEvidence: true,
                attachmentField: target === "receiving" ? "receiving_proof_attachment_ids" : "delivery_challan_attachment_id",
                attachmentFieldMode: target === "receiving" ? "append" : "set",
                files: files.map((file) => ({ file, ...classifyWorkflowFile(file), role: target === "receiving" ? "proof" : "delivery", caption: target === "receiving" ? "GRN receiving proof" : `Delivery challan ${challanNo.trim() || "proof"}` })),
            });
            registerBatch(queued.batchId);
            const captures = queued.files.map((item, index) => {
                const preview = withLocalPreview(item, files[index]);
                return { ...preview, id: item.uploadItemId, file_name: item.fileName, mime_type: item.mimeType, url: preview.previewUrl, captured_at: new Date().toISOString() };
            });
            if (target === "receiving") setReceivingProofs((current) => [...current, ...captures]);
            else setChallanProof(captures.at(-1));
            toast.success(`${captures.length} ${target === "receiving" ? "receiving" : "challan"} file${captures.length === 1 ? "" : "s"} queued`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "GRN proof could not be queued");
        }
    };
    const removeReceivingProof = async (proof: PendingProof) => {
        await cancelQueuedWorkflowFile(proof);
        setReceivingProofs((current) => current.filter((row) => row.id !== proof.id));
    };
    const removeChallanProof = async () => {
        if (!challanProof) return;
        await cancelQueuedWorkflowFile(challanProof);
        setChallanProof(undefined);
    };
    const onFile = async () => {
        if (filing)
            return;
        if (!selectedPO) {
            toast.error("Select a PO to file this GRN against.");
            return;
        }
        if (!receivingProofs.length) {
            toast.error("Add at least one receiving photo/proof.");
            return;
        }
        if (!challanNo.trim()) {
            toast.error("Enter the delivery challan number.");
            return;
        }
        if (inspectionStatus !== "accepted" && !(inspectionNotes.trim() || mismatchNotes.trim())) {
            toast.error("Describe the shortage, damage, or rejection.");
            return;
        }
        const grnItems: LineItem[] = items.map((it) => {
            const qty = receivedMap[it.id] ?? it.quantity;
            return {
                id: genItemId("gi"),
                title: it.title,
                description: it.description,
                article_id: it.article_id,
                category_id: it.category_id,
                quantity: qty,
                unit_id: it.unit_id,
                unit_name: it.unit_name,
                rate: it.rate,
                amount: qty * it.rate,
                tax_rate: it.tax_rate,
                status: qty === it.quantity ? "matched" : "mismatched",
                source_kind: "grn",
                source_item_id: it.id,
                ordered_qty: it.quantity,
                received_qty: qty,
            };
        });
        try {
            setFiling(true);
            const id = fileGRN({
                id: reservedGrnId,
                po_id: selectedPO.id,
                mismatch_notes: mismatched ? mismatchNotes.trim() || undefined : undefined,
                damage_shortage_notes: inspectionStatus !== "accepted" ? (inspectionNotes.trim() || mismatchNotes.trim() || undefined) : undefined,
                inspection_status: inspectionStatus,
                inspection_notes: inspectionNotes.trim() || undefined,
                batch_serial_details: batchSerialDetails.trim() || undefined,
                delivery_challan_no: challanNo.trim(),
                delivery_challan_file: challanProof ? { file_name: challanProof.fileName, attachment_id: challanProof.attachmentId, mime_type: challanProof.mimeType, caption: `Delivery challan ${challanNo.trim()}` } : undefined,
                receiving_files: receivingProofs.map((proof) => ({ file_name: proof.fileName, attachment_id: proof.attachmentId, mime_type: proof.mimeType, caption: "GRN receiving proof" })),
                items: grnItems,
                // CV-11: Pass the actual signed-in user's name (procurement.ts ignores this field
                // and uses actor.name anyway, but we set it for consistency / future-proofing).
                received_by: receiverName,
            });
            commitBatches();
            onOpenChange(false);
            openDetail("grn", id);
            const submittedForVerification = authUser?.role === "Field Staff";
            toast.success(submittedForVerification
                ? `GRN submitted with ${receivingProofs.length + (challanProof ? 1 : 0)} Google Drive file${receivingProofs.length + (challanProof ? 1 : 0) === 1 ? "" : "s"} — awaiting Operations/Owner verification before stock is posted.`
                : `GRN filed with ${receivingProofs.length + (challanProof ? 1 : 0)} Google Drive file${receivingProofs.length + (challanProof ? 1 : 0) === 1 ? "" : "s"} — stock updated.`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "GRN could not be filed.");
        }
        finally {
            setFiling(false);
        }
    };
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>File GRN</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Receive material against a purchase order. Stock is updated from the received quantities. Record the actual vendor invoice and complete PO–GRN–invoice matching separately before approval or payment.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Against PO
            </label>
            <select value={poId} onChange={(e) => {
            setPoId(e.target.value);
            setReceivedQtys({});
        }} className="h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Select a PO…</option>
              {eligiblePOs.map((p) => (<option key={p.id} value={p.id}>
                  {p.po_no} · {p.vendor_name} · {p.work_order_no || "—"}
                </option>))}
            </select>
          </div>

          {selectedPO && (<>
              <div className="overflow-x-auto rd-scroll rounded-lg border border-border">
                <div className="min-w-[520px]">
                <div className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.7fr_0.7fr] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Item</span>
                  <span className="text-right">Ordered</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Received</span>
                  <span className="text-right">Amount</span>
                </div>
                {items.map((it) => {
                const received = receivedMap[it.id] ?? it.quantity;
                const isShort = received !== it.quantity;
                return (<div key={it.id} className="grid grid-cols-[1.6fr_0.5fr_0.6fr_0.7fr_0.7fr] gap-2 border-b border-border px-3 py-2 text-xs last:border-0">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {it.title}
                        </p>
                        {it.unit_name && (<p className="text-[10px] text-muted-foreground">
                            {it.unit_name}
                          </p>)}
                      </div>
                      <span className="text-right font-mono text-muted-foreground">
                        {it.quantity}
                      </span>
                      <span className="text-right font-mono text-muted-foreground">
                        {formatINR(it.rate)}
                      </span>
                      <input type="number" min={0} value={received} onChange={(e) => setReceivedQtys((m) => ({
                        ...m,
                        [it.id]: Math.max(0, Number(e.target.value) || 0),
                    }))} className={"h-8 w-full rounded border bg-card px-1.5 text-right text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (isShort
                            ? "border-destructive/40 bg-destructive/[0.04] text-destructive"
                            : "border-input")}/>
                      <span className="text-right font-mono font-semibold">
                        {formatINR(received * it.rate)}
                      </span>
                    </div>);
            })}
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border border-primary/20 bg-primary/[0.025] p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Receiving photos / proof <span className="text-destructive">*</span></label>
                  <Input type="file" accept={MANAGED_FILE_ACCEPT} multiple onChange={(event) => captureProofs(event, "receiving")} className="h-8 text-xs"/>
                  <p className="text-[10px] text-muted-foreground">At least one receiving file is required. Uploads start immediately and continue after the GRN dialog closes.</p>
                  {receivingProofs.length > 0 && <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">{receivingProofs.map((proof) => <div key={proof.id} className="relative"><FilePreview file={{ fileName: proof.file_name, mimeType: proof.mime_type, url: proof.url }} compact controls/><button type="button" onClick={() => void removeReceivingProof(proof)} className="absolute right-0 top-0 rounded bg-background/90 px-1 text-[10px] text-destructive">×</button></div>)}</div>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Delivery challan no. & proof <span className="text-destructive">*</span></label>
                  <Input value={challanNo} onChange={(event) => setChallanNo(event.target.value)} placeholder="e.g. DC-8745" className="h-8 text-xs"/>
                  <Input type="file" accept={MANAGED_FILE_ACCEPT} onChange={(event) => captureProofs(event, "challan")} className="h-8 text-xs"/>
                  <p className="text-[10px] text-muted-foreground">A challan image, video, or PDF is queued immediately and linked to the GRN.</p>
                  {challanProof && <div className="relative max-w-40"><FilePreview file={{ fileName: challanProof.file_name, mimeType: challanProof.mime_type, url: challanProof.url }} compact controls/><button type="button" onClick={() => void removeChallanProof()} className="absolute right-0 top-0 rounded bg-background/90 px-1 text-[10px] text-destructive">×</button></div>}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Inspection outcome <span className="text-destructive">*</span></label>
                  <select value={inspectionStatus} onChange={(event) => setInspectionStatus(event.target.value as typeof inspectionStatus)} className="h-8 w-full rounded border border-input bg-card px-2 text-xs"><option value="accepted">Accepted — count/condition okay</option><option value="accepted_with_observation">Accepted with observation — shortage/damage noted</option><option value="rejected">Rejected / quarantine</option></select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase text-muted-foreground">Batch / serial details</label>
                  <Input value={batchSerialDetails} onChange={(event) => setBatchSerialDetails(event.target.value)} placeholder="Optional batch / serial / shade details" className="h-8 text-xs"/>
                </div>
                <div className="sm:col-span-2"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Inspection notes</label><Textarea value={inspectionNotes} onChange={(event) => setInspectionNotes(event.target.value)} placeholder="Condition, shortages, damaged packaging, verification notes…" className="mt-1 min-h-16 text-xs"/></div>
              </div>

              {mismatched && (<div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5"/> Mismatch detected —
                    an obstacle will be raised on file
                  </div>
                  <input type="text" value={mismatchNotes} onChange={(e) => setMismatchNotes(e.target.value)} placeholder="Mismatch notes (e.g. 2 sheets damaged in transit)" className="h-8 rounded border border-destructive/30 bg-card px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
                </div>)}

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                Filing as <strong className="text-foreground">
                  {mismatched || inspectionStatus !== "accepted" ? "Delivery exception" : "Received · invoice match pending"}
                </strong>{" "}
                · received by {receiverName}
              </div>
            </>)}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onFile} disabled={!selectedPO || filing}>
            File GRN
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
