"use client";
import * as React from "react";
import { ExternalLink, FileText, FileVideo, Image as ImageIcon, Unlink, ZoomIn, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
export type FilePreviewSource = {
    fileName: string;
    mimeType?: string;
    googleFileId?: string;
    url?: string;
    thumbnailUrl?: string;
};
type FilePreviewProps = {
    file: FilePreviewSource;
    className?: string;
    compact?: boolean;
    controls?: boolean;
    onOpen?: () => void;
    interactive?: boolean;
};
function extension(name: string) {
    const value = name.toLowerCase();
    const dot = value.lastIndexOf(".");
    return dot >= 0 ? value.slice(dot + 1) : "";
}
export function fileKind(file: FilePreviewSource) {
    const mime = (file.mimeType || "").toLowerCase();
    const ext = extension(file.fileName);
    if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "heic"].includes(ext))
        return "image" as const;
    if (mime.startsWith("video/") || ["mp4", "mov", "m4v", "webm", "avi", "mkv", "3gp"].includes(ext))
        return "video" as const;
    if (mime === "application/pdf" || ext === "pdf")
        return "pdf" as const;
    return "document" as const;
}
export function managedPreviewUrl(file: FilePreviewSource) {
    if (file.googleFileId)
        return `/api/google-drive/preview?fileId=${encodeURIComponent(file.googleFileId)}`;
    return file.url || "";
}
export function managedThumbnailUrl(file: FilePreviewSource, width = 360) {
    if (file.googleFileId)
        return `/api/google-drive/thumbnail?fileId=${encodeURIComponent(file.googleFileId)}&w=${Math.max(120, Math.min(720, Math.round(width)))}`;
    return file.thumbnailUrl || (fileKind(file) === "image" ? file.url || "" : "");
}
export function managedOpenUrl(file: FilePreviewSource) {
    if (file.url)
        return file.url;
    if (file.googleFileId)
        return `https://drive.google.com/file/d/${encodeURIComponent(file.googleFileId)}/view`;
    return "";
}
function IconForKind({ kind }: {
    kind: ReturnType<typeof fileKind>;
}) {
    if (kind === "video")
        return <FileVideo className="h-6 w-6 text-primary"/>;
    if (kind === "pdf" || kind === "document")
        return <FileText className="h-6 w-6 text-primary"/>;
    return <ImageIcon className="h-6 w-6 text-primary"/>;
}
function FileViewer({ file, open, onOpenChange }: {
    file: FilePreviewSource;
    open: boolean;
    onOpenChange: (value: boolean) => void;
}) {
    const kind = fileKind(file);
    const previewUrl = managedPreviewUrl(file);
    const driveUrl = managedOpenUrl(file);
    return (<Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="truncate text-base">{file.fileName}</DialogTitle>
          <DialogDescription className="sr-only">Full preview loaded on demand from managed Google Drive.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(100vh-9rem)] min-h-72 overflow-auto bg-muted/30 p-3">
          {kind === "image" && previewUrl ? <img src={previewUrl} alt={file.fileName} decoding="async" className="mx-auto max-h-[calc(100vh-12rem)] max-w-full rounded-md object-contain"/> : null}
          {kind === "video" && previewUrl ? <video src={previewUrl} controls preload="metadata" className="mx-auto max-h-[calc(100vh-12rem)] max-w-full rounded-md bg-black"/> : null}
          {kind === "pdf" && previewUrl ? <iframe title={`Preview ${file.fileName}`} src={previewUrl} loading="lazy" className="h-[calc(100vh-12rem)] min-h-[32rem] w-full rounded-md border border-border bg-white"/> : null}
          {kind === "document" ? <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center"><IconForKind kind={kind}/><p className="max-w-sm text-sm text-muted-foreground">This file does not have an inline preview. Open the managed Drive file to view it.</p></div> : null}
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          {driveUrl ? <a href={driveUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-primary hover:bg-accent/40"><ExternalLink className="h-3.5 w-3.5"/>Open in Google Drive</a> : null}
        </div>
      </DialogContent>
    </Dialog>);
}
export function FilePreview({ file, className, compact = false, controls: _controls = true, onOpen, interactive = true }: FilePreviewProps) {
    const kind = fileKind(file);
    const sourceKey = `${file.googleFileId || ""}|${file.thumbnailUrl || ""}|${file.url || ""}|${file.mimeType || ""}|${file.fileName}`;
    const [thumbnailFailed, setThumbnailFailed] = React.useState(false);
    const [viewerOpen, setViewerOpen] = React.useState(false);
    const thumbnailUrl = managedThumbnailUrl(file, compact ? 320 : 640);
    const openUrl = managedOpenUrl(file);
    const hasInlinePreview = Boolean(file.googleFileId || /^blob:|^data:/i.test(file.url || ""));
    const height = compact ? "h-20" : "h-40";
    React.useEffect(() => setThumbnailFailed(false), [sourceKey]);
    const open = () => {
        if (onOpen)
            return onOpen();
        if (hasInlinePreview)
            return setViewerOpen(true);
        if (openUrl)
            window.open(openUrl, "_blank", "noopener,noreferrer");
    };
    const mediaThumbnail = thumbnailUrl && !thumbnailFailed ? (<img src={thumbnailUrl} alt="" loading="lazy" decoding="async" fetchPriority="low" onError={() => setThumbnailFailed(true)} className={cn("h-full w-full object-cover", kind === "pdf" ? "object-contain bg-white p-1" : "")}/>) : thumbnailFailed && !openUrl && !file.googleFileId ? (<div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-destructive/5 px-2 text-center"><Unlink className="h-6 w-6 text-destructive/70"/><span className="line-clamp-1 text-[10px] font-semibold text-destructive/80">File unavailable</span><span className="line-clamp-2 text-[10px] text-muted-foreground">{file.fileName}</span></div>) : thumbnailFailed ? (<div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted/30 px-2 text-center"><IconForKind kind={kind}/><span className="line-clamp-1 text-[10px] font-semibold text-muted-foreground">Preview unavailable</span><span className="line-clamp-2 text-[10px] text-muted-foreground">{file.fileName}</span></div>) : (<div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted/30 px-2 text-center"><IconForKind kind={kind}/><span className="line-clamp-2 text-[10px] font-medium text-muted-foreground">{file.fileName}</span></div>);
    const kindOverlay = kind === "video" ? <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white"><Play className="ml-0.5 h-3.5 w-3.5 fill-current"/></span> : kind === "pdf" ? <span className="absolute left-1.5 top-1.5 rounded bg-destructive/85 px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span> : null;
    const actionOverlay = interactive ? <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition-opacity group-hover:opacity-100"><ZoomIn className="h-3.5 w-3.5"/></span> : null;
    const content = <>{mediaThumbnail}{kindOverlay}{actionOverlay}<span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">{file.fileName}</span></>;
    const classes = cn("group relative block w-full overflow-hidden rounded-md border border-border bg-muted/20 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", height, className);
    const card = interactive ? <button type="button" onClick={open} className={classes} title={`Preview ${file.fileName}`}>{content}</button> : <div className={classes}>{content}</div>;
    return <>{card}{interactive && !onOpen && hasInlinePreview ? <FileViewer file={file} open={viewerOpen} onOpenChange={setViewerOpen}/> : null}</>;
}
