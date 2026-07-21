"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { useRDashStore } from "@/lib/rdash/store";
import { toast } from "sonner";
import { notifyCreated } from "@/lib/rdash/notify";
import { Wallet, Send, BookOpen, Image as ImageIcon, Pin, Layers } from "lucide-react";
function useCustomer(customerId?: string) {
    const db = useRDashStore((s) => s.db);
    return React.useMemo(() => db.customers.find((p) => p.id === customerId), [db.customers, customerId]);
}
const todayIsoDate = () => new Date().toISOString().slice(0, 10);
const PAYMENT_MODES = ["cash", "upi", "cheque", "bank_transfer"] as const;
export function RecordPaymentDialog({ open, onOpenChange, customerId, defaultIsAdvance }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    customerId?: string;
    /** When true, the dialog opens with the "Advance payment" toggle pre-checked (used by "Add advance" buttons). */
    defaultIsAdvance?: boolean;
}) {
    const addPayment = useRDashStore((s) => s.addPayment);
    const closeActionDialog = useRDashStore((s) => s.closeActionDialog);
    const db = useRDashStore((s) => s.db);
    // B-13: When the dialog is opened without a preselected customer (e.g. from PaymentRecovery
    // "+ Add payment"), allow the user to pick a customer inline. When a customerId prop is
    // supplied (the normal case from a customer context), the field stays read-only.
    const [pickedCustomerId, setPickedCustomerId] = React.useState<string>("");
    const effectiveCustomerId = customerId || pickedCustomerId;
    const customer = useCustomer(effectiveCustomerId);
    // QA-FINANCE-001: Service-finance validation requires a Site. Auto-pick the customer's
    // first site (most customers in this domain have exactly one site per job), and surface
    // a Site selector when the customer has more than one so the user can override.
    const customerSites = React.useMemo(() => {
        if (!effectiveCustomerId) return [];
        return db.sites.filter((s: any) => s.customer_id === effectiveCustomerId && !s.is_archived);
    }, [db.sites, effectiveCustomerId]);
    const [pickedSiteId, setPickedSiteId] = React.useState<string>("");
    const effectiveSiteId = pickedSiteId || (customerSites.length === 1 ? customerSites[0].id : "");
    const [amount, setAmount] = React.useState<string>("");
    const [mode, setMode] = React.useState<string>("upi");
    const [milestone, setMilestone] = React.useState<string>("");
    const [dueDate, setDueDate] = React.useState<string>(todayIsoDate());
    const [isAdvance, setIsAdvance] = React.useState<boolean>(false);
    React.useEffect(() => {
        if (open) {
            setAmount("");
            setMode("upi");
            setMilestone("");
            setDueDate(todayIsoDate());
            setPickedCustomerId("");
            setPickedSiteId("");
            // B-5: Honor defaultIsAdvance so the "Add advance" button lands directly in advance mode.
            setIsAdvance(Boolean(defaultIsAdvance));
        }
    }, [open, defaultIsAdvance]);
    // When the picked customer changes, reset the site picker (the new customer's sites differ).
    React.useEffect(() => {
        setPickedSiteId("");
    }, [effectiveCustomerId]);
    const amountNum = parseFloat(amount);
    const valid = !isNaN(amountNum) && amountNum > 0 && Boolean(effectiveCustomerId) && Boolean(effectiveSiteId);
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!valid) {
            if (!effectiveCustomerId) {
                toast.error("Select a customer before creating the milestone");
                return;
            }
            if (!effectiveSiteId) {
                toast.error("Select a site for this collection milestone. Service finance requires a Site — add a site to the customer first.");
                return;
            }
            toast.error("Enter a valid amount greater than 0");
            return;
        }
        // B-5: When the advance toggle is on, mark the payment as an advance (is_advance=true)
        // and default the milestone label to "Advance" so it lands in the customer's Advances tab.
        const advanceLabel = milestone.trim() || (isAdvance ? "Advance" : undefined);
        const paymentId = addPayment({
            customer_id: effectiveCustomerId,
            site_id: effectiveSiteId,
            amount: amountNum,
            mode,
            milestone_label: advanceLabel,
            due_date: dueDate || todayIsoDate(),
            status: "pending",
            is_advance: isAdvance,
        });
        notifyCreated("payment", paymentId, advanceLabel || (isAdvance ? "Advance" : "Collection milestone"), `${customer?.name || "Customer"} · ₹${amountNum.toLocaleString("en-IN")} · ${isAdvance ? "advance milestone" : "pending collection milestone"}`);
        onOpenChange(false);
        closeActionDialog();
    }
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-success/10 text-success">
              <Wallet className="h-4 w-4"/>
            </span>
            {isAdvance ? "Create Advance Milestone" : "Create Collection Milestone"}
          </DialogTitle>
          <DialogDescription>
            {isAdvance
                ? `Record an advance collection milestone${customer ? ` for ${customer.name}` : ""}. The customer's advance balance will be tracked separately and adjusted against future invoices.`
                : `Create a planned collection milestone${customer ? ` for ${customer.name}` : ""}. Issue the invoice separately, then record actual receipts against that invoice.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pay-customer">Customer <span className="text-destructive">*</span></Label>
            {customerId ? (
              <Input id="pay-customer" value={customer?.name || "—"} readOnly className="bg-muted/40"/>
            ) : (
              <Select value={pickedCustomerId} onValueChange={setPickedCustomerId}>
                <SelectTrigger id="pay-customer" className="w-full">
                  <SelectValue placeholder="— select a customer —"/>
                </SelectTrigger>
                <SelectContent>
                  {db.customers.map((p) => (<SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.phone || "—"}
                    </SelectItem>))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* QA-FINANCE-001: Site selector. Service-finance validation requires a Site.
              Auto-picks when the customer has exactly one site; shows a dropdown when
              there are multiple; shows a warning when the customer has no sites yet. */}
          <div className="grid gap-1.5">
            <Label htmlFor="pay-site">Site <span className="text-destructive">*</span></Label>
            {customerSites.length === 0 ? (
              <p className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                This customer has no sites yet. Add a site first — service finance requires a Site link.
              </p>
            ) : customerSites.length === 1 ? (
              <Input id="pay-site" value={customerSites[0].name || customerSites[0].id} readOnly className="bg-muted/40"/>
            ) : (
              <Select value={effectiveSiteId} onValueChange={setPickedSiteId}>
                <SelectTrigger id="pay-site" className="w-full">
                  <SelectValue placeholder="— select a site —"/>
                </SelectTrigger>
                <SelectContent>
                  {customerSites.map((s: any) => (<SelectItem key={s.id} value={s.id}>
                      {s.name || s.id}{s.address ? ` · ${s.address.slice(0, 60)}` : ""}
                    </SelectItem>))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* B-5: Advance payment toggle. When on, the created payment is marked is_advance=true so it
              appears in the customer's Advances tab and contributes to the advance balance. */}
          <label htmlFor="pay-advance" className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Advance payment</span>
              <span className="text-[11px] text-muted-foreground">Mark this milestone as a customer advance (tracked separately, adjusted against future invoices).</span>
            </span>
            <Switch id="pay-advance" checked={isAdvance} onCheckedChange={setIsAdvance}/>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pay-amount">Amount (₹) <span className="text-destructive">*</span></Label>
              <Input id="pay-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus required/>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="pay-mode">Preferred collection mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger id="pay-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (<SelectItem key={m} value={m}>
                      {m.replace("_", " ")}
                    </SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="pay-milestone">Milestone label</Label>
            <Input id="pay-milestone" value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder={isAdvance ? "e.g. Booking advance / Token / First advance" : "e.g. 50% advance / Site measurement / Final"}/>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pay-due">Due date</Label>
              <Input id="pay-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
            </div>

          </div>

          <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{isAdvance
            ? "This creates a pending advance milestone. Issue the customer invoice against it, then record actual receipts (the advance balance is tracked separately)."
            : "This creates a planned collection milestone only. It does not record money received. Issue the customer invoice, then post one or more actual receipts against it."}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              {isAdvance ? "Create advance" : "Create milestone"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>);
}
const CHANNELS = [
    { value: "WhatsApp", label: "WhatsApp" },
    { value: "Email", label: "Email" },
    { value: "SMS", label: "SMS" },
];
function assetUrl(db: ReturnType<typeof useRDashStore.getState>["db"], driveAssetId?: string, fallback?: string) {
    return db.master.fileAssets?.find((item) => item.id === driveAssetId)?.web_view_link || fallback || "";
}
function openExternalShare(channel: string, customer: ReturnType<typeof useCustomer>, text: string) {
    const phone = String(customer?.whatsapp || customer?.phone || "").replace(/\D/g, "");
    if (channel === "WhatsApp" && phone) {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
        return "WhatsApp draft opened";
    }
    if (channel === "Email" && customer?.email) {
        window.location.href = `mailto:${encodeURIComponent(customer.email)}?body=${encodeURIComponent(text)}`;
        return "Email draft opened";
    }
    if (channel === "SMS" && phone) {
        window.location.href = `sms:${phone}?body=${encodeURIComponent(text)}`;
        return "SMS draft opened";
    }
    void navigator.clipboard?.writeText(text);
    return "Share text copied";
}
export function SendCatalogueDialog({ open, onOpenChange, customerId }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    customerId?: string;
}) {
    const closeActionDialog = useRDashStore((s) => s.closeActionDialog);
    const db = useRDashStore((s) => s.db);
    const sendComm = useRDashStore((s) => s.sendComm);
    const customer = useCustomer(customerId);
    const catalogues = (db.master.catalogues || []).filter((item) => item.status === "active" && item.sendable_to_customer !== false);
    const [selected, setSelected] = React.useState<string[]>([]);
    const [channel, setChannel] = React.useState("WhatsApp");
    React.useEffect(() => { if (open) {
        setSelected(catalogues.slice(0, 1).map((item) => item.id));
        setChannel("WhatsApp");
    } }, [open]);
    const toggle = (id: string) => setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
    const submit = (event: React.FormEvent) => { event.preventDefault(); const selectedRows = catalogues.filter((item) => selected.includes(item.id)); if (!selectedRows.length)
        return toast.error("Choose a customer-shareable catalogue"); const links = selectedRows.map((item) => assetUrl(db, item.drive_asset_id, item.catalog_url)).filter(Boolean); const text = `Hello ${customer?.name || ""},\n\nHere are the requested catalogues:\n${selectedRows.map((item, index) => `${index + 1}. ${item.title}${links[index] ? `\n${links[index]}` : ""}`).join("\n\n")}`; const outcome = openExternalShare(channel, customer, text); sendComm({ channel: "catalogue", customer_id: customer?.id || "", staff_name: "Owner", subject: selectedRows.map((item) => item.title).join(", "), body: text, status: "prepared" }); toast.success(outcome, { description: `${selectedRows.length} catalogue${selectedRows.length === 1 ? "" : "s"} logged as prepared` }); onOpenChange(false); closeActionDialog(); };
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[520px]"><DialogHeader><DialogTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary"><BookOpen className="h-4 w-4"/></span>Send Catalogue</DialogTitle><DialogDescription>Shares the actual catalogue links registered in Drive, without creating copies.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4"><fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer-shareable catalogues</legend>{catalogues.map((item) => { const checked = selected.includes(item.id); return <label key={item.id} className={checked ? "flex cursor-pointer items-center gap-3 rounded-md border border-primary/40 bg-primary/[0.04] px-3 py-2 text-sm" : "flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/40"}><Checkbox checked={checked} onCheckedChange={() => toggle(item.id)}/><span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.title}</span><span className="block truncate text-[10px] text-muted-foreground">{assetUrl(db, item.drive_asset_id, item.catalog_url) || "No share link"}</span></span></label>; })}{!catalogues.length ? <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No customer-shareable catalogues are configured. Add them in Media, Catalogues & Pinterest.</p> : null}</fieldset><ShareChannel value={channel} onChange={setChannel} id="cat-channel"/><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!selected.length}><Send className="mr-1.5 h-3.5 w-3.5"/>Prepare share</Button></DialogFooter></form></DialogContent></Dialog>;
}
export function SendReferenceMediaDialog({ open, onOpenChange, customerId }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    customerId?: string;
}) {
    const closeActionDialog = useRDashStore((s) => s.closeActionDialog);
    const db = useRDashStore((s) => s.db);
    const sendComm = useRDashStore((s) => s.sendComm);
    const customer = useCustomer(customerId);
    const media = (db.master.referenceMedia || []).filter((item) => item.status === "active" && item.sendable_to_customer !== false);
    const [selected, setSelected] = React.useState<string[]>([]);
    const [channel, setChannel] = React.useState("WhatsApp");
    React.useEffect(() => { if (open) {
        setSelected(media.slice(0, 1).map((item) => item.id));
        setChannel("WhatsApp");
    } }, [open]);
    const toggle = (id: string) => setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
    const submit = (event: React.FormEvent) => { event.preventDefault(); const selectedRows = media.filter((item) => selected.includes(item.id)); if (!selectedRows.length)
        return toast.error("Choose at least one reference item"); const text = `Hello ${customer?.name || ""},\n\nHere are the selected design references:\n${selectedRows.map((item, index) => `${index + 1}. ${item.title}\n${assetUrl(db, item.drive_asset_id, item.media_url)}`).join("\n\n")}`; const outcome = openExternalShare(channel, customer, text); sendComm({ channel: "reference", customer_id: customer?.id || "", staff_name: "Owner", subject: selectedRows.map((item) => item.title).join(", "), body: text, status: "prepared" }); toast.success(outcome, { description: `${selectedRows.length} reference item${selectedRows.length === 1 ? "" : "s"} logged as prepared` }); onOpenChange(false); closeActionDialog(); };
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[620px]"><DialogHeader><DialogTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary"><ImageIcon className="h-4 w-4"/></span>Send Reference Media</DialogTitle><DialogDescription>Select Drive-backed or direct-link references for the customer.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4"><fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reference library</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{media.map((item) => { const checked = selected.includes(item.id); return <button key={item.id} type="button" onClick={() => toggle(item.id)} className={checked ? "flex min-h-20 items-start gap-2 rounded-lg border border-primary bg-primary/[0.04] p-3 text-left" : "flex min-h-20 items-start gap-2 rounded-lg border border-border p-3 text-left hover:bg-accent/40"}><Checkbox checked={checked} onCheckedChange={() => toggle(item.id)}/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block line-clamp-2 text-[10px] text-muted-foreground">{assetUrl(db, item.drive_asset_id, item.media_url) || "No share link"}</span></span></button>; })}</div>{!media.length ? <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No customer-shareable reference media has been added yet.</p> : null}</fieldset><ShareChannel value={channel} onChange={setChannel} id="ref-channel"/><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!selected.length}><Send className="mr-1.5 h-3.5 w-3.5"/>Prepare share</Button></DialogFooter></form></DialogContent></Dialog>;
}
export function SendPinterestBoardDialog({ open, onOpenChange, customerId }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    customerId?: string;
}) {
    const closeActionDialog = useRDashStore((s) => s.closeActionDialog);
    const db = useRDashStore((s) => s.db);
    const sendComm = useRDashStore((s) => s.sendComm);
    const customer = useCustomer(customerId);
    const boards = (db.master.pinterestBoards || []).filter((item) => item.status === "active" && item.sendable_to_customer !== false);
    const [selected, setSelected] = React.useState("");
    const [channel, setChannel] = React.useState("WhatsApp");
    React.useEffect(() => { if (open) {
        setSelected(boards[0]?.id || "");
        setChannel("WhatsApp");
    } }, [open]);
    const submit = (event: React.FormEvent) => { event.preventDefault(); const board = boards.find((item) => item.id === selected); if (!board)
        return toast.error("Choose a Pinterest board"); const text = `Hello ${customer?.name || ""},\n\nHere is an inspiration board for your workRequired:\n${board.title}\n${board.board_url}`; const outcome = openExternalShare(channel, customer, text); sendComm({ channel: "pinterest", customer_id: customer?.id || "", staff_name: "Owner", subject: board.title, body: text, status: "prepared" }); toast.success(outcome, { description: "Pinterest board logged as prepared" }); onOpenChange(false); closeActionDialog(); };
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[560px]"><DialogHeader><DialogTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive"><Pin className="h-4 w-4"/></span>Send Pinterest Board</DialogTitle><DialogDescription>Share a curated inspiration link from the central Pinterest board library.</DialogDescription></DialogHeader><form onSubmit={submit} className="grid gap-4"><fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Boards</legend>{boards.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={selected === item.id ? "flex items-center gap-3 rounded-lg border border-primary bg-primary/[0.04] p-3 text-left" : "flex items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-accent/40"}><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Pin className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="block truncate text-[10px] text-muted-foreground">{item.board_url}</span></span><span className={selected === item.id ? "h-3 w-3 rounded-full bg-primary" : "h-3 w-3 rounded-full border border-muted-foreground"}/></button>)}{!boards.length ? <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No customer-shareable Pinterest boards are configured.</p> : null}</fieldset><ShareChannel value={channel} onChange={setChannel} id="pin-channel"/><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!selected}><Send className="mr-1.5 h-3.5 w-3.5"/>Prepare share</Button></DialogFooter></form></DialogContent></Dialog>;
}
function ShareChannel({ value, onChange, id }: {
    value: string;
    onChange: (value: string) => void;
    id: string;
}) { return <div className="grid gap-1.5"><Label htmlFor={id}>Channel</Label><Select value={value} onValueChange={onChange}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>; }
const MATERIAL_GROUPS: {
    category: string;
    icon: string;
    options: {
        id: string;
        name: string;
        note?: string;
    }[];
}[] = [
    {
        category: "Plywood",
        icon: "🪵",
        options: [
            { id: "ply-bwp-marine", name: "BWP Marine", note: "Boiling-water proof — wet zones" },
            { id: "ply-bwr-commercial", name: "BWR Commercial", note: "Boiling-water resistant — general" },
        ],
    },
    {
        category: "Hardware",
        icon: "🔩",
        options: [
            { id: "hw-softclose-hinges", name: "Soft-close Hinges", note: "Hettich / Hafele" },
            { id: "hw-telescopic-channels", name: "Telescopic Channels", note: "Full-extension drawer slides" },
            { id: "hw-lift-up-systems", name: "Lift-up Systems", note: "Aventos HK / HF" },
        ],
    },
    {
        category: "Finish",
        icon: "🎨",
        options: [
            { id: "fn-acrylic", name: "Acrylic", note: "High-gloss mirror finish" },
            { id: "fn-laminate", name: "Laminate", note: "Premium textured laminates" },
            { id: "fn-pu", name: "PU Paint", note: "Polyurethane matte/satin" },
            { id: "fn-veneer", name: "Natural Veneer", note: "Real wood veneer + polish" },
        ],
    },
];
export function SendMaterialOptionsDialog({ open, onOpenChange, customerId, }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    customerId?: string;
}) {
    const closeActionDialog = useRDashStore((s) => s.closeActionDialog);
    const sendComm = useRDashStore((s) => s.sendComm);
    const customer = useCustomer(customerId);
    const [selected, setSelected] = React.useState<string[]>([]);
    const [channel, setChannel] = React.useState<string>("WhatsApp");
    React.useEffect(() => {
        if (open) {
            setSelected(MATERIAL_GROUPS.map((g) => g.options[0].id));
            setChannel("WhatsApp");
        }
    }, [open]);
    function toggle(id: string) {
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (selected.length === 0) {
            toast.error("Pick at least one material option to send");
            return;
        }
        // B-7: Resolve selected option names and log this share to the customer's communication
        // history via sendComm (matching SendCatalogue/SendReference/SendPinterest pattern).
        const allOptions = MATERIAL_GROUPS.flatMap((g) => g.options);
        const selectedNames = selected
            .map((id) => allOptions.find((o) => o.id === id)?.name)
            .filter(Boolean) as string[];
        const subject = `${selectedNames.length} material option${selectedNames.length === 1 ? "" : "s"}`;
        const body = `Hello ${customer?.name || ""},\n\nHere are the material & finish options we discussed:\n${selectedNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;
        try {
            sendComm({
                channel: "material",
                customer_id: customer?.id || "",
                staff_name: "Owner",
                subject,
                body,
                status: "prepared",
            });
        }
        catch (error) {
            // Don't block the user's share action if logging fails — surface as a warning.
            toast.warning(error instanceof Error ? error.message : "Could not log communication to customer history.");
        }
        toast.success(`Material options sent via ${channel}`, {
            description: `${selected.length} options selected${customer ? ` → ${customer.name}` : ""}`,
        });
        onOpenChange(false);
        closeActionDialog();
    }
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Layers className="h-4 w-4"/>
            </span>
            Send Material Options
          </DialogTitle>
          <DialogDescription>
            Share material & finish options{customer ? ` with ${customer.name}` : ""}. Pick one or more.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Material options by category
            </legend>
            <div className="max-h-72 overflow-y-auto rd-scroll grid gap-3 pr-1">
              {MATERIAL_GROUPS.map((g) => (<div key={g.category} className="rounded-lg border border-border bg-background/60 p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <span aria-hidden>{g.icon}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">{g.category}</span>
                  </div>
                  <div className="grid gap-1.5">
                    {g.options.map((o) => {
                const checked = selected.includes(o.id);
                return (<label key={o.id} className={"flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors " +
                        (checked ? "border-primary/40 bg-primary/[0.04]" : "border-transparent hover:bg-accent/40")}>
                          <Checkbox checked={checked} onCheckedChange={() => toggle(o.id)} aria-label={o.name}/>
                          <span className="flex-1">
                            <span className="font-medium text-foreground">{o.name}</span>
                            {o.note && (<span className="ml-1.5 text-[11px] text-muted-foreground">· {o.note}</span>)}
                          </span>
                        </label>);
            })}
                  </div>
                </div>))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selected.length} option{selected.length === 1 ? "" : "s"} selected
            </p>
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="mat-channel">Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger id="mat-channel" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (<SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={selected.length === 0}>
              <Send className="mr-1.5 h-3.5 w-3.5"/> Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>);
}
export function ActionDialogsHost() {
    const actionDialog = useRDashStore((s) => s.actionDialog);
    const closeActionDialog = useRDashStore((s) => s.closeActionDialog);
    const type = actionDialog.type;
    const customerId = actionDialog.customerId;
    const open = type !== null;
    const onOpenChange = (v: boolean) => {
        if (!v)
            closeActionDialog();
    };
    return (<>
      <RecordPaymentDialog open={open && type === "record-payment"} onOpenChange={onOpenChange} customerId={customerId}/>
      <SendCatalogueDialog open={open && type === "send-catalogue"} onOpenChange={onOpenChange} customerId={customerId}/>
      <SendReferenceMediaDialog open={open && type === "send-reference"} onOpenChange={onOpenChange} customerId={customerId}/>
      <SendPinterestBoardDialog open={open && type === "send-pinterest"} onOpenChange={onOpenChange} customerId={customerId}/>
      <SendMaterialOptionsDialog open={open && type === "send-material"} onOpenChange={onOpenChange} customerId={customerId}/>
    </>);
}
