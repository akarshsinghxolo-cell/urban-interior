"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { asManagedFileAsset, MANAGED_FILE_ACCEPT, uploadManagedFile } from "@/lib/rdash/file-assets";
import { FilePreview } from "../FilePreview";
import { assetPreview, attachedFilesForIds } from "@/lib/rdash/file-attachments";
import type { CommChannel, CommSend } from "@/lib/rdash/types";
import { MetricCard, StatusBadge, Avatar, EmptyState } from "../primitives";
import { formatDateTime, relativeDay, titleCase } from "@/lib/rdash/format";
import { MessageSquare, Image as ImageIcon, BookOpen, Palette, Send, Paperclip, CheckCircle2, AlertTriangle, X, ExternalLink, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
const CHANNEL_META: Record<CommChannel, {
    label: string;
    icon: React.ReactNode;
    color: string;
    desc: string;
}> = {
    whatsapp: { label: "WhatsApp", icon: <MessageSquare className="h-4 w-4"/>, color: "bg-success/10 text-success border-success/20", desc: "Send designs/options via WhatsApp" },
    pinterest: { label: "Pinterest Board", icon: <Palette className="h-4 w-4"/>, color: "bg-destructive/10 text-destructive border-destructive/20", desc: "Share curated inspiration board" },
    catalogue: { label: "Catalogue", icon: <BookOpen className="h-4 w-4"/>, color: "bg-primary/10 text-primary border-primary/20", desc: "Send product catalogue PDF" },
    material: { label: "Material Options", icon: <ImageIcon className="h-4 w-4"/>, color: "bg-warning/10 text-warning border-warning/20", desc: "Shortlist material/shade options" },
    reference: { label: "Reference Media", icon: <ImageIcon className="h-4 w-4"/>, color: "bg-primary/10 text-primary border-primary/20", desc: "Share reference photos" },
    email: { label: "Email", icon: <Send className="h-4 w-4"/>, color: "bg-muted text-muted-foreground border-border", desc: "Formal email communication" },
};
export { CHANNEL_META };
const STATUS_META: Record<CommSend["status"], {
    label: string;
    className: string;
}> = {
    prepared: { label: "Prepared", className: "bg-warning/10 text-warning border-warning/20" },
    sent: { label: "Sent", className: "bg-primary/10 text-primary border-primary/20" },
    delivered: { label: "Delivered", className: "bg-primary/15 text-primary border-primary/25" },
    read: { label: "Read", className: "bg-success/10 text-success border-success/20" },
    failed: { label: "Failed", className: "bg-destructive/10 text-destructive border-destructive/20" },
};
export function CommunicationCentreModule({ channelFilter }: {
    channelFilter?: string;
}) {
    const db = useRDashStore((s) => s.db);
    const sendComm = useRDashStore((s) => s.sendComm);
    const currentUser = useRDashStore((s) => s.currentUser);
    const openDetail = useRDashStore((s) => s.openDetail);
    const [composeOpen, setComposeOpen] = React.useState(false);
    const [composeChannel, setComposeChannel] = React.useState<CommChannel>((channelFilter as CommChannel) || "whatsapp");
    const filtered = React.useMemo(() => {
        if (!channelFilter || channelFilter === "all")
            return db.commSends;
        return db.commSends.filter((c) => c.channel === channelFilter);
    }, [db.commSends, channelFilter]);
    const byChannel = React.useMemo(() => {
        const m = new Map<CommChannel, number>();
        db.commSends.forEach((c) => m.set(c.channel, (m.get(c.channel) || 0) + 1));
        return m;
    }, [db.commSends]);
    const readCount = db.commSends.filter((c) => c.status === "read").length;
    const failedCount = db.commSends.filter((c) => c.status === "failed").length;
    const openCompose = (ch: CommChannel) => { setComposeChannel(ch); setComposeOpen(true); };
    return (<div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessageSquare className="h-5 w-5"/></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Communication Centre</h2>
            <p className="text-xs text-muted-foreground">WhatsApp, Pinterest, catalogues and material options — all customer comms in one place</p>
          </div>
        </div>
        <Button size="sm" onClick={() => openCompose("whatsapp")}>
          <Send className="mr-1 h-3.5 w-3.5"/> New message
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Total sends" value={db.commSends.length} tone="primary" icon={<Send className="h-4 w-4"/>}/>
        <MetricCard label="Read" value={readCount} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Failed" value={failedCount} tone="destructive" icon={<AlertTriangle className="h-4 w-4"/>}/>
        <MetricCard label="Channels" value={Object.keys(byChannel).length} tone="default" icon={<MessageSquare className="h-4 w-4"/>}/>
      </div>
      <div className="rd-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* B-15: Email channel card is now included (previously excluded via c !== "email"),
            so users can initiate email comms directly from the Communication Centre. */}
        {(Object.keys(CHANNEL_META) as CommChannel[]).map((ch) => {
            const meta = CHANNEL_META[ch];
            const count = byChannel.get(ch) || 0;
            return (<button key={ch} type="button" onClick={() => openCompose(ch)} className="group flex flex-col gap-2 rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft">
              <div className="flex items-center justify-between">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", meta.color)}>{meta.icon}</span>
                {count > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span>}
              </div>
              <div>
                <p className="text-xs font-bold">{meta.label}</p>
                <p className="text-[10px] text-muted-foreground">{meta.desc}</p>
              </div>
            </button>);
        })}
      </div>
      <div className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
          <h3 className="text-sm font-semibold">Send history {channelFilter && channelFilter !== "all" ? `· ${CHANNEL_META[channelFilter as CommChannel]?.label || ""}` : ""}</h3>
          <span className="text-[11px] text-muted-foreground">{filtered.length} sends</span>
        </div>
        {filtered.length === 0 ? (<div className="py-8 text-center text-xs text-muted-foreground">No sends yet. Use a channel card above to compose.</div>) : (<div className="divide-y divide-border">
            {filtered.map((c) => {
                const meta = CHANNEL_META[c.channel];
                const status = STATUS_META[c.status];
                return (<button key={c.id} type="button" onClick={() => openDetail("customer", c.customer_id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/30">
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", meta.color)}>{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{c.subject}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{relativeDay(c.sent_at)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{(c.customer_name || "Customer")} · via {meta.label}</p>
                    {c.body && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{c.body}</p>}
                    {c.attachment_ids && c.attachment_ids.length > 0 && (<div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                        {attachedFilesForIds(db, c.attachment_ids).map(({ attachment, asset }) => <FilePreview key={attachment.id} file={assetPreview(asset)} compact controls={false} className="w-20"/>)}
                      </div>)}
                  </div>
                  <StatusBadge label={status.label} className={status.className}/>
                </button>);
            })}
          </div>)}
      </div>

      {composeOpen && (<ComposeDialog channel={composeChannel} onClose={() => setComposeOpen(false)} onSend={(data) => {
                sendComm({ ...data, channel: composeChannel });
                toast.success(`${CHANNEL_META[composeChannel].label} sent to ${db.customers.find((customer) => customer.id === data.customer_id)?.name || "Customer"}`);
                setComposeOpen(false);
            }}/>)}
    </div>);
}
function ComposeDialog({ channel, onClose, onSend }: {
    channel: CommChannel;
    onClose: () => void;
    onSend: (data: {
        customer_id: string;
        staff_name: string;
        subject: string;
        body?: string;
        source_attachment_ids?: string[];
        followup_id?: string;
        task_id?: string;
        work_order_id?: string;
        quotation_id?: string;
        schedules_next_followup?: { due_date: string; purpose: string };
    }) => void;
}) {
    const db = useRDashStore((s) => s.db);
    // B-14: Use the actual signed-in user (from the store) instead of the hardcoded "Anita Rao".
    // Falls back to "Staff" if the user context is somehow missing.
    const currentUser = useRDashStore((s) => s.currentUser);
    const staffName = React.useMemo(() => {
        try {
            return currentUser().name || "Staff";
        }
        catch {
            return "Staff";
        }
    }, [currentUser]);
    const [customerId, setCustomerId] = React.useState(db.customers[0]?.id || "");
    const [subject, setSubject] = React.useState("");
    const [body, setBody] = React.useState("");
    const [followupId, setFollowupId] = React.useState("");
    const [taskId, setTaskId] = React.useState("");
    const [scheduleNext, setScheduleNext] = React.useState(false);
    const [nextDate, setNextDate] = React.useState("");
    const [nextPurpose, setNextPurpose] = React.useState("");
    const createFileAssetAndAttach = useRDashStore((s) => s.createFileAssetAndAttach);
    const [files, setFiles] = React.useState<File[]>([]);
    const [sending, setSending] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const meta = CHANNEL_META[channel];
    const customer = db.customers.find((p) => p.id === customerId);
    // Customer-scoped follow-ups + tasks for the picker (only open items).
    const customerFollowups = React.useMemo(() => {
        return db.followups.filter((f) => f.customer_id === customerId &&
            (f.status === "pending" || f.status === "scheduled" || f.status === "missed"));
    }, [db.followups, customerId]);
    const customerTasks = React.useMemo(() => {
        return db.tasks.filter((t) => t.customer_id === customerId &&
            (t.status === "todo" || t.status === "in_progress" || t.status === "review"));
    }, [db.tasks, customerId]);
    const send = async () => {
        if (!customerId || !subject || sending)
            return;
        try {
            setSending(true);
            const sourceAttachmentIds = await Promise.all(files.map(async (file) => {
                const kind = file.type.startsWith("image/") || file.type.startsWith("video/") ? "media" : "document";
                const uploaded = await uploadManagedFile({ file, fileName: file.name, entityType: "customer", entityId: customerId, kind, role: "document", caption: `Communication attachment · ${subject}`, visibility: "customer", customerShareable: true });
                return createFileAssetAndAttach(asManagedFileAsset(uploaded, { kind }), { entity_type: "customer", entity_id: customerId, role: "document", caption: `Communication attachment · ${subject}`, visibility: "customer", customer_shareable: true });
            }));
            const payload: {
                customer_id: string; staff_name: string; subject: string; body?: string;
                source_attachment_ids?: string[]; followup_id?: string; task_id?: string;
                schedules_next_followup?: { due_date: string; purpose: string };
            } = {
                customer_id: customerId,
                staff_name: staffName,
                subject: subject || "Untitled",
                body: body || undefined,
                source_attachment_ids: sourceAttachmentIds.length ? sourceAttachmentIds : undefined,
                followup_id: followupId || undefined,
                task_id: taskId || undefined,
            };
            if (scheduleNext && nextDate) {
                payload.schedules_next_followup = {
                    due_date: nextDate,
                    purpose: nextPurpose.trim() || `Follow up after "${subject}"`,
                };
            }
            onSend(payload);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Attachment upload failed. The message was not sent.");
        }
        finally {
            setSending(false);
        }
    };
    return (<Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg border", meta.color)}>{meta.icon}</span>
            Send via {meta.label}
          </DialogTitle>
          <DialogDescription className="text-xs">{meta.desc}. The customer will receive this on their {meta.label.toLowerCase()}.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4 rd-scroll">
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Customer</label>
            <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setFollowupId(""); setTaskId(""); }} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              {db.customers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}
            </select>
            {customer && <p className="mt-1 text-[10px] text-muted-foreground">To: {customer.whatsapp || customer.phone}</p>}
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Kitchen design options" className="h-9 text-sm"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Message</label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your message…" rows={3} className="text-sm"/>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Attachments</label>
            <input ref={fileInputRef} type="file" accept={MANAGED_FILE_ACCEPT} multiple className="hidden" onChange={(event) => { setFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }}/>
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()}><Paperclip className="mr-1 h-3.5 w-3.5"/> Choose files</Button>
              <span className="text-[10px] text-muted-foreground">Images, videos, and PDFs upload to this customer’s managed Google Drive folder before the message is sent. No file-count limit.</span>
            </div>
            {files.length > 0 && <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">{files.map((file) => <div key={`${file.name}-${file.size}`} className="relative"><FilePreview file={{ fileName: file.name, mimeType: file.type, url: URL.createObjectURL(file) }} compact controls/><button type="button" onClick={() => setFiles((items) => items.filter((item) => item !== file))} aria-label={`Remove ${file.name}`} className="absolute right-0 top-0 rounded bg-background/90 p-0.5 text-destructive"><X className="h-3 w-3"/></button></div>)}</div>}
          </div>
          {/* Operations linkage — wire this comm into a follow-up / task and optionally
              schedule the next follow-up so the loop closes automatically. */}
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Link to operations (optional)</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Follow-up</label>
                <select value={followupId} onChange={(e) => setFollowupId(e.target.value)} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs">
                  <option value="">— None —</option>
                  {customerFollowups.map((f) => <option key={f.id} value={f.id}>{f.title}{f.due_date ? ` · due ${f.due_date}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Task</label>
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs">
                  <option value="">— None —</option>
                  {customerTasks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.due_date ? ` · due ${t.due_date}` : ""}</option>)}
                </select>
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs font-medium text-foreground">
              <input type="checkbox" checked={scheduleNext} onChange={(e) => setScheduleNext(e.target.checked)} className="h-3.5 w-3.5 rounded border-border"/>
              Schedule next follow-up after sending
            </label>
            {scheduleNext && (<div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr]">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Due date</label>
                <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="h-8 text-xs"/>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground">Purpose</label>
                <Input value={nextPurpose} onChange={(e) => setNextPurpose(e.target.value)} placeholder={`e.g. Call to confirm ${subject || "options"}`} className="h-8 text-xs"/>
              </div>
            </div>)}
          </div>
        </div>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}><X className="mr-1 h-3.5 w-3.5"/> Cancel</Button>
          <Button size="sm" onClick={send} disabled={!customerId || !subject || sending}>
            <Send className="mr-1 h-3.5 w-3.5"/> {sending ? "Uploading files…" : `Send ${meta.label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}
