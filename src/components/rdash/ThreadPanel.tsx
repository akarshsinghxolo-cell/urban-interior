"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import type { Thread, ThreadMessage, ThreadMessageAttachment, FileAsset, RDashDatabase } from "@/lib/rdash/types";
import { Avatar } from "./primitives";
import { formatINR, relativeDay, formatDate, titleCase } from "@/lib/rdash/format";
import { toast } from "sonner";
import { X, Send, Paperclip, MessageSquare, CheckCircle2, AlertCircle, Info, FileText, Link2, AtSign, FileVideo, Search, Clock, ArrowUpRight, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { MANAGED_FILE_ACCEPT } from "@/lib/rdash/file-assets";
import { classifyWorkflowFile, enqueueWorkflowFiles, uploadPurposeForEntity } from "@/lib/uploads/workflow-upload";
import { FilePreview, fileKind, managedPreviewUrl, managedOpenUrl } from "./FilePreview";
import type { FilePreviewSource } from "./FilePreview";
import { attachedPreview, attachedFileById, assetPreview, entityFiles } from "@/lib/rdash/file-attachments";
import { renderMentions, MENTION_ENTITY_TYPES, buildMentionableEntities, filterMentionableEntities, type MentionableEntity } from "@/lib/rdash/mentions";
import { resolveThreadRecordEntityType } from "@/lib/rdash/entity-context";
export function ThreadView({ threadId }: {
    threadId: string;
}) {
    const thread = useRDashStore((s) => s.db.threads.find((t) => t.id === threadId));
    const db = useRDashStore((s) => s.db);
    const addReply = useRDashStore((s) => s.addThreadReply);
    const currentUser = useRDashStore((s) => s.currentUser);
    const disposedRef = React.useRef(true);
    React.useEffect(() => { disposedRef.current = true; return () => { disposedRef.current = false; }; }, []);  // STAGE-4-FIX: unmount guard
    const [reply, setReply] = React.useState("");
    const [replyParentId, setReplyParentId] = React.useState<string | undefined>();
    const [uploadingProof, setUploadingProof] = React.useState(false);
    const [pickedAttachmentIds, setPickedAttachmentIds] = React.useState<string[]>([]);
    const [search, setSearch] = React.useState("");
    const [filter, setFilter] = React.useState<"all" | "comment" | "decision" | "system" | "alert">("all");
    // Mention autocomplete state.
    const [mentionOpen, setMentionOpen] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState("");
    const [mentionIndex, setMentionIndex] = React.useState(0);
    const mentionAnchorRef = React.useRef<number>(-1);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const mentionListRef = React.useRef<HTMLDivElement>(null);
    // Build the mentionable entity list from the workspace db (React Compiler memoizes).
    const mentionable = buildMentionableEntities(db);
    // Scroll the active mention item into view when navigating with arrow keys.
    // (Placed before the early return so hooks rules are satisfied.)
    React.useEffect(() => {
        if (!mentionOpen || !mentionListRef.current) return;
        const active = mentionListRef.current.querySelector("[data-mention-active=\"true\"]") as HTMLElement | null;
        if (active) active.scrollIntoView({ block: "nearest" });
    }, [mentionOpen, mentionIndex]);
    if (!thread) {
        return (<div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60"><MessageSquare className="h-7 w-7"/></div>
        <div>
          <p className="text-sm font-medium text-foreground">No thread yet</p>
          <p className="mt-0.5 text-[11px]">A conversation thread appears here once the first event is logged.</p>
        </div>
      </div>);
    }
    const user = currentUser();
    const entityType = resolveThreadRecordEntityType(db, thread.record_type, thread.record_id) || "general";
    const existingFiles = entityFiles(db, entityType, thread.record_id);
    const onSend = () => {
        if (!reply.trim() && !pickedAttachmentIds.length)
            return;
        const attachments: ThreadMessageAttachment[] = pickedAttachmentIds
            .map((aid): ThreadMessageAttachment | null => {
            const attached = attachedFileById(db, aid);
            if (!attached)
                return null;
            const preview = assetPreview(attached.asset);
            const fk = fileKind(preview);
            const kind: ThreadMessageAttachment["kind"] = fk === "document" ? "file" : fk;
            return {
                id: `tma-${attached.attachment.id}`,
                file_asset_id: attached.asset.id,
                entity_file_attachment_id: attached.attachment.id,
                name: attached.asset.file_name,
                kind,
                mime: attached.asset.mime_type,
                size: attached.asset.file_size_bytes,
                thumbnail_url: attached.asset.thumbnail_url,
                preview_url: attached.asset.web_view_link,
                caption: attached.attachment.caption,
            };
        })
            .filter((x): x is ThreadMessageAttachment => x !== null);
        addReply(thread.id, {
            author: user.name,
            role: user.role,
            body: reply.trim() || (attachments.length ? `Shared ${attachments.length} file${attachments.length === 1 ? "" : "s"}` : ""),
            kind: "comment",
            parent_message_id: replyParentId,
            attachments: attachments.length ? attachments : undefined,
        });
        setReply("");
        setReplyParentId(undefined);
        setPickedAttachmentIds([]);
        toast.success("Reply posted");
    };
    const attachProof = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.currentTarget.value = "";
        if (!files.length) return;
        setUploadingProof(true);
        try {
            const queued = await enqueueWorkflowFiles({
                sourceFlow: "thread_attachment",
                sourceLabel: thread.title || "Thread attachment",
                targetEntityType: entityType,
                targetEntityId: thread.record_id,
                targetLabel: thread.title,
                purpose: uploadPurposeForEntity(entityType),
                files: files.map((file) => ({ file, ...classifyWorkflowFile(file), role: classifyWorkflowFile(file).role === "photo" ? "proof" : classifyWorkflowFile(file).role, caption: "Thread attachment" })),
            });
            queued.files.forEach((item) => addReply(thread.id, {
                author: user.name,
                role: user.role,
                body: `Attachment queued: ${item.fileName}`,
                kind: "proof",
                proof_attachment_id: item.attachmentId,
                parent_message_id: replyParentId,
            }));
            setReplyParentId(undefined);
            toast.success(`${queued.files.length} file${queued.files.length === 1 ? "" : "s"} queued; uploads continue in Background Activity`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Attachment could not be queued");
        } finally {
            if (disposedRef.current) setUploadingProof(false);
        }
    };
    const togglePicked = (id: string) => {
        setPickedAttachmentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    };
    // --- Mention autocomplete helpers ---
    const mentionResults = mentionOpen ? filterMentionableEntities(mentionable, mentionQuery, 8) : [];
    const safeMentionIndex = mentionResults.length ? Math.min(mentionIndex, mentionResults.length - 1) : 0;
    const insertMention = (entity: MentionableEntity) => {
        const ta = textareaRef.current;
        if (!ta) return;
        const anchor = mentionAnchorRef.current;
        if (anchor < 0) return;
        const cursor = ta.selectionStart;
        const insertion = `@[${entity.label}](${entity.entity_type}:${entity.entity_id}) `;
        const next = reply.slice(0, anchor) + insertion + reply.slice(cursor);
        setReply(next);
        setMentionOpen(false);
        setMentionQuery("");
        setMentionIndex(0);
        mentionAnchorRef.current = -1;
        // Restore focus + cursor after the inserted mention.
        requestAnimationFrame(() => {
            if (ta) {
                const pos = anchor + insertion.length;
                ta.focus();
                ta.setSelectionRange(pos, pos);
            }
        });
    };
    const onReplyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setReply(val);
        // Detect @[ trigger at cursor position.
        const cursor = e.target.selectionStart;
        const trigger = detectMentionTrigger(val, cursor);
        if (trigger) {
            mentionAnchorRef.current = trigger.anchor;
            setMentionQuery(trigger.query);
            setMentionIndex(0);
            if (!mentionOpen) setMentionOpen(true);
        }
        else if (mentionOpen) {
            setMentionOpen(false);
            setMentionQuery("");
            mentionAnchorRef.current = -1;
        }
    };
    const onReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Mention autocomplete keyboard nav takes priority when open.
        if (mentionOpen && mentionResults.length) {
            if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionResults.length); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionResults[safeMentionIndex]); return; }
            if (e.key === "Escape") { e.preventDefault(); setMentionOpen(false); mentionAnchorRef.current = -1; return; }
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSend();
        }
    };
    // Filtered message list for the thread header count + tree rendering.
    const filteredMessages = filterThreadMessages(thread.messages, search, filter);
    const systemCount = thread.messages.filter((m) => m.kind === "system").length;
    const commentCount = thread.messages.filter((m) => m.kind === "comment" || m.kind === "proof").length;
    const decisionCount = thread.messages.filter((m) => m.kind === "decision").length;
    const alertCount = thread.messages.filter((m) => m.kind === "alert").length;
    const filterTabs: Array<{ id: typeof filter; label: string; count: number }> = [
        { id: "all", label: "All", count: thread.messages.length },
        { id: "comment", label: "Chat", count: commentCount },
        { id: "system", label: "System", count: systemCount },
        { id: "decision", label: "Decisions", count: decisionCount },
        { id: "alert", label: "Mentions", count: alertCount },
    ];
    return (<div className="flex h-full flex-col">
      {/* Thread header: title + message count + search + filter pills */}
      <div className="shrink-0 border-b border-border bg-card/50 px-4 pb-2.5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessagesSquare className="h-4 w-4"/></span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{thread.title}</p>
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-success"/></span>{thread.messages.length} message{thread.messages.length !== 1 ? "s" : ""} · {thread.participants.length} participant{thread.participants.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="relative w-32 shrink-0 sm:w-44">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"/>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 rounded-lg bg-muted/40 pl-7 pr-2 text-xs"/>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {filterTabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setFilter(tab.id)} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors", filter === tab.id ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted")}>
              {tab.label}<span className={cn("rounded-full px-1 text-[10px]", filter === tab.id ? "bg-primary-foreground/20" : "bg-background/70")}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>
      {/* Messages */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4 rd-scroll">
        {filteredMessages.length === 0 ? (<div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
          <Search className="h-6 w-6 opacity-50"/>
          <p className="text-xs">{search ? `No messages match "${search}"` : "No messages in this filter"}</p>
        </div>) : (<ThreadTree messages={filteredMessages} onReply={(messageId) => setReplyParentId(messageId)}/>)}
      </div>
      {/* Composer */}
      <div className="relative border-t border-border bg-muted/20 p-3">
        {/* Mention autocomplete popover */}
        {mentionOpen && mentionResults.length > 0 && (<div className="absolute bottom-full left-3 right-3 z-30 mb-1 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Mention {mentionResults.length > 1 ? `(${mentionResults.length})` : ""}</div>
          <div ref={mentionListRef} className="max-h-56 overflow-y-auto rd-scroll">
            {mentionResults.map((entity, i) => (
              <button key={`${entity.entity_type}-${entity.entity_id}`} type="button" data-mention-active={i === safeMentionIndex || undefined} onMouseEnter={() => setMentionIndex(i)} onClick={() => insertMention(entity)} className={cn("flex w-full items-center gap-2 border-b border-border/60 px-3 py-1.5 text-left text-xs last:border-0", i === safeMentionIndex ? "bg-primary/10" : "hover:bg-accent/40")}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold uppercase text-primary">{entity.entity_type.slice(0, 2)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{entity.label}</p>
                  {entity.sublabel && <p className="truncate text-[10px] text-muted-foreground">{entity.sublabel}</p>}
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{entity.group}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-border bg-muted/30 px-3 py-1 text-[10px] text-muted-foreground"><kbd className="rounded bg-background px-1">↑↓</kbd> navigate · <kbd className="rounded bg-background px-1">↵</kbd> select · <kbd className="rounded bg-background px-1">Esc</kbd> close</div>
        </div>)}
        {mentionOpen && mentionResults.length === 0 && (<div className="absolute bottom-full left-3 right-3 z-30 mb-1 rounded-xl border border-border bg-popover px-3 py-2 text-[11px] text-muted-foreground shadow-lg">No entities match "{mentionQuery}"</div>)}
        {replyParentId && <div className="mb-2 flex items-center justify-between rounded-md border border-primary/20 bg-primary/[0.04] px-2 py-1 text-[11px] text-primary"><span>Replying to a specific message</span><button type="button" className="underline" onClick={() => setReplyParentId(undefined)}>Clear</button></div>}
        {pickedAttachmentIds.length > 0 && (<div className="mb-2 flex flex-wrap gap-1.5">
            {pickedAttachmentIds.map((aid) => {
                const attached = attachedFileById(db, aid);
                if (!attached)
                    return null;
                return (<span key={aid} className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  <FileText className="h-3 w-3"/>
                  <span className="max-w-[12rem] truncate">{attached.asset.file_name}</span>
                  <button type="button" onClick={() => togglePicked(aid)} className="ml-0.5 rounded-full hover:bg-primary/20" aria-label="Remove attachment"><X className="h-3 w-3"/></button>
                </span>);
            })}
          </div>)}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <Textarea ref={textareaRef} value={reply} onChange={onReplyChange} placeholder={replyParentId ? "Reply to this message…" : "Write a reply…  Use @[ to mention"} className="min-h-[48px] resize-none rounded-xl bg-card text-sm shadow-sm" rows={2} onKeyDown={onReplyKeyDown}/>
          </div>
          <div className="flex flex-col gap-1">
            <input ref={fileInputRef} type="file" accept={MANAGED_FILE_ACCEPT} multiple className="hidden" onChange={attachProof}/>
            <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-lg" onClick={() => fileInputRef.current?.click()} disabled={uploadingProof} title="Attach Google Drive proof">
              <Paperclip className="h-4 w-4"/>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="icon" variant="outline" className="h-9 w-9 rounded-lg" title="Attach existing file from this record" disabled={!existingFiles.length}>
                  <Link2 className="h-4 w-4"/>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Attach existing files · {existingFiles.length}
                </div>
                <div className="max-h-72 overflow-y-auto rd-scroll">
                  {existingFiles.length === 0 ? (<div className="px-3 py-6 text-center text-[11px] text-muted-foreground">No files are attached to this record yet.</div>) : (existingFiles.map((item) => {
                    const id = item.attachment.id;
                    const checked = pickedAttachmentIds.includes(id);
                    return (<label key={id} htmlFor={`pick-${id}`} className={cn("flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 text-xs last:border-0 hover:bg-accent/40", checked && "bg-primary/[0.06]")}>
                        <Checkbox id={`pick-${id}`} checked={checked} onCheckedChange={() => togglePicked(id)} className="mt-0.5"/>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{item.asset.file_name}</p>
                          <p className="text-[10px] text-muted-foreground">{titleCase(String(item.attachment.role))} · {titleCase(item.attachment.visibility)}{item.asset.mime_type ? ` · ${item.asset.mime_type}` : ""}</p>
                        </div>
                      </label>);
                }))}
                </div>
              </PopoverContent>
            </Popover>
            <Button type="button" size="icon" className="h-9 w-9 rounded-lg" onClick={onSend} disabled={!reply.trim() && !pickedAttachmentIds.length} title="Send reply (Ctrl+Enter)"><Send className="h-4 w-4"/></Button>
          </div>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><AtSign className="h-3 w-3 text-primary/70"/>Type <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">@[</code> to mention — creates backlinks across threads</span>
          <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3"/>Images/PDFs/videos upload to Google Drive</span>
        </p>
      </div>
    </div>);
}

/**
 * Detect whether the cursor is inside an active @[mention trigger.
 * Returns the anchor (index of `@`) and the query text after `[` if active,
 * or null if the cursor is not inside a mention trigger.
 */
function detectMentionTrigger(text: string, cursor: number): { anchor: number; query: string } | null {
    if (cursor < 2) return null;
    // Walk backwards from the cursor looking for `@[`.
    let i = cursor - 1;
    while (i >= 1) {
        const ch = text[i];
        if (ch === "\n") return null; // crossed a line — not a mention
        if (ch === "]" ) return null; // mention already closed
        if (ch === "[" && text[i - 1] === "@") {
            const query = text.slice(i + 1, cursor);
            if (query.includes(")") ) return null;
            return { anchor: i - 1, query };
        }
        i--;
    }
    return null;
}

/** Filter thread messages by search text + kind filter. Preserves nesting
 *  (a parent is kept if it matches OR any of its descendants match). */
function filterThreadMessages(messages: ThreadMessage[], search: string, filter: "all" | "comment" | "decision" | "system" | "alert"): ThreadMessage[] {
    const q = search.trim().toLowerCase();
    const kindMatch = (m: ThreadMessage): boolean => {
        if (filter === "all") return true;
        if (filter === "comment") return m.kind === "comment" || m.kind === "proof";
        return m.kind === filter;
    };
    const textMatch = (m: ThreadMessage): boolean => {
        if (!q) return true;
        return (m.body || "").toLowerCase().includes(q) || (m.author_name || "").toLowerCase().includes(q);
    };
    // Build child→parent index so we can keep ancestors of matching descendants.
    const byParent = new Map<string | undefined, ThreadMessage[]>();
    messages.forEach((m) => {
        const key = m.parent_message_id;
        byParent.set(key, [...(byParent.get(key) || []), m]);
    });
    const keep = new Set<string>();
    const walk = (m: ThreadMessage): boolean => {
        const selfMatch = kindMatch(m) && textMatch(m);
        const children = byParent.get(m.id) || [];
        const childMatch = children.some(walk);
        if (selfMatch || childMatch) keep.add(m.id);
        return selfMatch || childMatch;
    };
    const roots = byParent.get(undefined) || [];
    roots.forEach(walk);
    return messages.filter((m) => keep.has(m.id));
}
function ThreadTree({ messages, onReply }: {
    messages: ThreadMessage[];
    onReply: (messageId: string) => void;
}) {
    const byParent = React.useMemo(() => {
        const map = new Map<string | undefined, ThreadMessage[]>();
        messages.forEach((message) => {
            const key = message.parent_message_id;
            map.set(key, [...(map.get(key) || []), message]);
        });
        return map;
    }, [messages]);
    const render = (message: ThreadMessage, depth = 0): React.ReactNode => (<div key={message.id} className={depth ? "ml-4 border-l border-primary/20 pl-3" : ""}>
      <MessageBubble m={message} nested={depth > 0} onReply={() => onReply(message.id)}/>
      <div className="mt-2 space-y-2">{(byParent.get(message.id) || []).map((child) => render(child, depth + 1))}</div>
    </div>);
    const roots = byParent.get(undefined) || [];
    return <>{roots.map((message) => render(message))}</>;
}
/** Resolve a ThreadMessageAttachment to a FilePreviewSource using the db. */
function attachmentToPreviewSource(db: RDashDatabase, att: ThreadMessageAttachment): FilePreviewSource | null {
    if (att.entity_file_attachment_id) {
        const attached = attachedFileById(db, att.entity_file_attachment_id);
        if (attached)
            return assetPreview(attached.asset);
    }
    if (att.file_asset_id) {
        const asset = db.master.fileAssets.find((a: FileAsset) => a.id === att.file_asset_id);
        if (asset)
            return assetPreview(asset);
    }
    if (att.thumbnail_url || att.preview_url) {
        return {
            fileName: att.name,
            mimeType: att.mime,
            url: att.preview_url,
            thumbnailUrl: att.thumbnail_url,
        };
    }
    return null;
}
/** Render a message's body with @mentions as styled, clickable pills. */
function MentionBody({ body }: { body: string }) {
    const openDetail = useRDashStore((s) => s.openDetail);
    const segments = React.useMemo(() => renderMentions(body), [body]);
    return (<p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
      {segments.map((seg, i) => seg.type === "text" ? (<span key={i}>{seg.text}</span>) : (<button key={i} type="button" onClick={() => {
        const et = seg.mention.entity_type;
        // Only navigate for known panel kinds (avoids TypeScript complaints
        // and runtime errors for arbitrary entity_types the user may type).
        if (et in MENTION_ENTITY_TYPES) {
            openDetail(et as any, seg.mention.entity_id);
        }
        else {
            console.log("[mention] unhandled entity_type", seg.mention);
        }
    }} className="mx-0.5 inline-flex items-center rounded bg-primary/10 px-1 py-0.5 text-[12px] font-medium text-primary align-baseline hover:bg-primary/20 hover:underline" title={`Open ${seg.mention.entity_type} ${seg.mention.entity_id}`}>
          <AtSign className="mr-0.5 h-3 w-3"/>{seg.mention.label}
        </button>))}
    </p>);
}
/** Render a message's general attachments (images, PDFs, videos, files). */
function MessageAttachments({ attachments }: { attachments: ThreadMessageAttachment[] }) {
    const db = useRDashStore((s) => s.db);
    return (<div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((att) => {
        const preview = attachmentToPreviewSource(db, att);
        if (!preview) {
            return (<span key={att.id} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
            <FileText className="h-3.5 w-3.5"/>{att.name}
          </span>);
        }
        if (att.kind === "video") {
            const src = managedPreviewUrl(preview);
            return (<div key={att.id} className="w-full max-w-sm overflow-hidden rounded-md border border-border bg-black">
            {src ? (<video src={src} controls preload="metadata" className="max-h-60 w-full"/>) : (<div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><FileVideo className="h-4 w-4"/>Video preview unavailable</div>)}
            <div className="truncate bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">{att.name}</div>
          </div>);
        }
        if (att.kind === "image" || att.kind === "pdf") {
            return (<FilePreview key={att.id} file={preview} compact controls className="max-w-[10rem]"/>);
        }
        // Generic file chip
        const openUrl = managedOpenUrl(preview);
        return (<a key={att.id} href={openUrl || "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground hover:bg-accent/40" title={att.name}>
          <FileText className="h-3.5 w-3.5 text-primary"/>
          <span className="max-w-[14rem] truncate">{att.name}</span>
        </a>);
    })}
    </div>);
}
function MessageBubble({ m, nested = false, onReply }: {
    m: ThreadMessage;
    nested?: boolean;
    onReply: () => void;
}) {
    const db = useRDashStore((state) => state.db);
    const proof = attachedPreview(db, m.proof_attachment_id);
    const isSystem = m.kind === "system";
    const isAlert = m.kind === "alert";
    const isDecision = m.kind === "decision";
    const isProof = m.kind === "proof";
    const absTime = formatDate(m.created_at);
    // System + alert messages render as a centered timeline pill — no avatar.
    // Alerts (mention backlinks) get a primary accent; system events get muted.
    if (isSystem || isAlert)
        return (<div className="flex items-center justify-center py-0.5">
        <span title={absTime} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium", isAlert ? "border-primary/20 bg-primary/[0.07] text-primary" : "border-border bg-muted/50 text-muted-foreground")}>
          {isAlert ? <ArrowUpRight className="h-3 w-3"/> : <Info className="h-3 w-3"/>}{m.body}<span className="text-[10px] opacity-60">· {relativeDay(m.created_at)}</span>
        </span>
      </div>);
    // Comment / decision / proof messages render as a full bubble with avatar.
    return (<div className={cn("group flex gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-muted/30", nested && "ml-4 border-l-2 border-primary/15 pl-3 hover:bg-primary/[0.03]", isDecision && "border border-success/20 bg-success/[0.04]", isProof && "border border-primary/15 bg-primary/[0.02]")}>
      <Avatar name={m.author_name} size={30}/>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">{m.author_name}</span>
          {m.author_role && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{m.author_role}</span>}
          {isDecision && <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success"><CheckCircle2 className="h-3 w-3"/>Decision</span>}
          {isProof && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"><Paperclip className="h-3 w-3"/>Proof</span>}
          <span title={absTime} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/80"><Clock className="h-2.5 w-2.5 opacity-60"/>{relativeDay(m.created_at)}</span>
        </div>
        <MentionBody body={m.body}/>
        {m.attachments && m.attachments.length > 0 && <MessageAttachments attachments={m.attachments}/>}
        {proof && <FilePreview file={proof} compact controls className="mt-1.5 max-w-xs"/>}
        <button type="button" onClick={onReply} className="mt-1 text-[10px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:underline">Reply</button>
      </div>
    </div>);
}
export function Field({ label, value, mono }: {
    label: string;
    value?: React.ReactNode;
    mono?: boolean;
}) {
    return (<div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-sm text-foreground", mono && "font-mono")}>
        {value || <span className="text-muted-foreground">—</span>}
      </span>
    </div>);
}
export function StatusPill({ label, tone = "default" }: {
    label: string;
    tone?: "default" | "success" | "warning" | "destructive" | "primary";
}) {
    const cls = {
        default: "bg-muted text-muted-foreground border-border",
        success: "bg-success/15 text-success border-success/25",
        warning: "bg-warning/15 text-warning border-warning/25",
        destructive: "bg-destructive/15 text-destructive border-destructive/25",
        primary: "bg-primary/10 text-primary border-primary/25",
    }[tone];
    return (<span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", cls)}>
      {label}
    </span>);
}
export function LineItemTable({ items, highlightSource, }: {
    items: import("@/lib/rdash/types").LineItem[];
    highlightSource?: string;
}) {
    if (!items.length) {
        return (<div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
        No line items.
      </div>);
    }
    const total = items.reduce((n, i) => n + i.amount, 0);
    return (<div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[1.6fr_0.5fr_0.5fr_0.7fr_0.8fr] gap-2 border-b border-border bg-muted/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
        <span className="text-center">Trace</span>
      </div>
      {items.map((it) => (<div key={it.id} className={cn("grid grid-cols-[1.6fr_0.5fr_0.5fr_0.7fr_0.8fr] gap-2 border-b border-border px-3 py-2 text-xs last:border-0", highlightSource && it.source_item_id === highlightSource && "bg-accent/40", it.held && "bg-warning/[0.06]")}>
          <div className="min-w-0">
            <p className={cn("truncate font-medium text-foreground", it.held && "line-through text-muted-foreground")}>
              {it.title}
              {it.held && <span className="ml-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">HELD</span>}
            </p>
            {it.unit_name && <p className="text-[10px] text-muted-foreground">{it.unit_name}</p>}
            {(it.site_name || it.area_name) && (<p className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                {it.site_name && <span className="rounded bg-primary/10 px-1 py-0.5 text-primary">{it.site_name}</span>}
                {it.area_name && <span className="rounded bg-muted px-1 py-0.5 text-muted-foreground">{it.area_name}</span>}
                {it.drawing_no && <span className="rounded bg-success/10 px-1 py-0.5 text-success">📐 {it.drawing_no}</span>}
              </p>)}
          </div>
          <span className="text-right font-mono">{it.quantity}</span>
          <span className="text-right font-mono text-muted-foreground">{formatINR(it.rate)}</span>
          <span className="text-right font-mono font-semibold">{formatINR(it.amount)}</span>
          <span className="text-center text-[10px] text-muted-foreground">
            {it.source_kind ? titleCase(it.source_kind) : "—"}
          </span>
        </div>))}
      <div className="grid grid-cols-[1.6fr_0.5fr_0.5fr_0.7fr_0.8fr] gap-2 bg-muted/30 px-3 py-2 text-xs font-bold">
        <span>Total</span>
        <span />
        <span />
        <span className="text-right font-mono">{formatINR(total)}</span>
        <span />
      </div>
    </div>);
}
