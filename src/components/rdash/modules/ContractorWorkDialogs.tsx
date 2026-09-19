"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, ArrowRight, DollarSign, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Contractor, ContractorBid, WorkOrder } from "@/lib/rdash/types";

export function EditContractorBidDialog({ bid, onClose, onSave, onWithdraw, saving = false }: {
    bid: ContractorBid;
    onClose: () => void;
    onSave: (patch: Partial<ContractorBid>) => void;
    onWithdraw: () => void;
    saving?: boolean;
}) {
    const [quoteAmount, setQuoteAmount] = React.useState<string>(bid.quote_amount != null ? String(bid.quote_amount) : "");
    const [estimatedDays, setEstimatedDays] = React.useState<string>(bid.estimated_days != null ? String(bid.estimated_days) : "");
    const [withMaterial, setWithMaterial] = React.useState<boolean>(Boolean(bid.with_material));
    const [evaluationNotes, setEvaluationNotes] = React.useState<string>(bid.evaluation_notes || "");
    const handleSave = () => {
        const patch: Partial<ContractorBid> = {};
        const q = parseFloat(quoteAmount);
        if (Number.isFinite(q) && q >= 0 && q !== bid.quote_amount) patch.quote_amount = q;
        const d = parseInt(estimatedDays);
        if (Number.isFinite(d) && d >= 0 && d !== bid.estimated_days) patch.estimated_days = d;
        if (withMaterial !== Boolean(bid.with_material)) patch.with_material = withMaterial;
        if (evaluationNotes.trim() !== (bid.evaluation_notes || "")) patch.evaluation_notes = evaluationNotes.trim();
        if (Object.keys(patch).length === 0) {
            toast.info("No changes to save.");
            return;
        }
        onSave(patch);
    };
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base"><Pencil className="h-4 w-4 text-primary"/> Edit bid · {bid.bid_no}</DialogTitle>
          <DialogDescription className="text-xs">{bid.contractor_name} · {bid.work_order_no} · {bid.scope}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Quote amount (₹)</label>
            <Input type="number" min="0" step="0.01" value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} placeholder="e.g. 58000" className="h-9 text-sm" autoFocus/>
            <p className="mt-1 text-[10px] text-muted-foreground">A positive quote is required before awarding the work.</p>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Estimated days</label>
            <Input type="number" min="0" step="1" value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)} placeholder="e.g. 7" className="h-9 text-sm"/>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <input type="checkbox" checked={withMaterial} onChange={(e) => setWithMaterial(e.target.checked)} className="h-4 w-4 rounded border-border"/>
            Contractor supplies materials
          </label>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Evaluation notes</label>
            <Textarea value={evaluationNotes} onChange={(e) => setEvaluationNotes(e.target.value)} placeholder="Internal notes about this bid — negotiation, references, concerns, etc." rows={3} className="text-sm"/>
          </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5"/> Cancel</Button>
          <Button variant="ghost" size="sm" disabled={saving} onClick={onWithdraw} className="text-destructive hover:bg-destructive/10" title="Withdraw from bidding for this scope">
            Withdraw bid
          </Button>
          <Button size="sm" disabled={saving} onClick={handleSave}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5"/> Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
export function CreateRABillDialog({ contractor, workOrder, releaseGuard, onClose, onUploadProof, onSubmit, saving = false }: {
    contractor: Pick<Contractor, "name">;
    workOrder: WorkOrder;
    releaseGuard: {
        ok: boolean;
        reason?: string;
    };
    onClose: () => void;
    onUploadProof: () => void;
    onSubmit: (amount: number, description: string, progressPct?: number) => void;
    saving?: boolean;
}) {
    const [amount, setAmount] = React.useState("");
    const [description, setDescription] = React.useState(`${contractor.name} — progress payment for ${workOrder.work_order_no}`);
    const [progressPct, setProgressPct] = React.useState(workOrder.progress?.toString() || "");
    // FIX-CONTRACTOR-BATCH2 / F.14: the ₹25,000 threshold doesn't apply to
    // bill creation — createContractorRABill always creates a "verified"
    // bill and posts the cost line immediately. The threshold only matters
    // later, in requestContractorBillPayment, where it gates payment RELEASE
    // approval. The previous wording ("Request approval" / "Post payment"
    // button labels + "Above ₹25,000 policy — owner approval required")
    // misled users into thinking the bill itself needed approval. Now the
    // dialog consistently says "Submit bill" and the threshold note
    // clarifies when it actually applies.
    const overThreshold = (parseFloat(amount) || 0) > 25000;
    // CV-2: The store now warns (via thread reply) but no longer hard-blocks RA bill creation when
    // contractor confirmation proof is missing. We still surface the warning prominently and offer
    // an in-context shortcut to upload the proof, but the submit button is no longer disabled —
    // the business can proceed and upload the proof before the final payment release.
    const proofMissing = !releaseGuard.ok;
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-primary"/> Create RA bill
          </DialogTitle>
          <DialogDescription className="text-xs">{contractor.name} · {workOrder.work_order_no} · {(workOrder.customer_name || "Customer")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Amount (₹)</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 58000" className="h-9 text-sm" autoFocus/>
            {amount && (<p className={cn("mt-1 text-[10px] font-medium", overThreshold ? "text-muted-foreground" : "text-muted-foreground")}>
                {/* FIX-CONTRACTOR-BATCH2 / F.14: corrected wording — bill
                    creation never requires approval; only the payment release
                    request (next step) does. */}
                Bill is created as &quot;verified&quot; and the cost is posted immediately{overThreshold ? ". Payments above ₹25,000 will require owner approval when you request release from Contractor Bills & Payments." : "."}
              </p>)}
          </div>
          {proofMissing && (<div className="rounded-md border border-warning/40 bg-warning/[0.08] p-2.5 text-xs text-warning">
              <div className="flex gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                <div className="flex-1">
                  <p className="font-semibold">Contractor confirmation proof not yet uploaded.</p>
                  <p className="mt-0.5 text-[11px] text-warning/90">{releaseGuard.reason}</p>
                  <p className="mt-1 text-[11px] text-warning/90">The RA bill can still be created (flexible mode) — upload the proof before releasing the final payment.</p>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-7 border-warning/50 text-warning hover:bg-warning/10" onClick={onUploadProof}>
                    <ArrowRight className="mr-1 h-3 w-3"/> Upload contractor confirmation
                  </Button>
                </div>
              </div>
            </div>)}
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Progress % (optional)</label>
            <Input type="number" value={progressPct} onChange={(e) => setProgressPct(e.target.value)} placeholder="e.g. 40" className="h-9 text-sm"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="text-sm"/>
          </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5"/> Cancel</Button>
          <Button size="sm" onClick={() => onSubmit(Number(amount), description.trim(), progressPct ? Number(progressPct) : undefined)} disabled={saving || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !description.trim() || (Boolean(progressPct) && (!Number.isFinite(Number(progressPct)) || Number(progressPct) < 0 || Number(progressPct) > 100))}>
            <DollarSign className="mr-1 h-3.5 w-3.5"/> Submit bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
