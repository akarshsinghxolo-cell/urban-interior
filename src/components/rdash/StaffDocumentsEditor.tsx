"use client";

import * as React from "react";
import { CheckCircle2, ExternalLink, FileText, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRDashStore } from "@/lib/rdash/store";
import type { StaffDocument } from "@/lib/rdash/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./primitives";

const documentTypes: Array<[StaffDocument["document_type"], string]> = [
  ["photo", "Photo"],
  ["aadhaar", "Aadhaar"],
  ["pan", "PAN"],
  ["id_proof", "ID proof"],
  ["address_proof", "Address proof"],
  ["bank", "Bank proof"],
  ["other", "Other"],
];

type UploadResponse = {
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  webViewLink: string;
  error?: string;
};

function statusTone(status: StaffDocument["status"]) {
  if (status === "verified") return "border-success/20 bg-success/10 text-success";
  if (status === "rejected") return "border-destructive/20 bg-destructive/10 text-destructive";
  if (status === "expired") return "border-warning/20 bg-warning/10 text-warning";
  return "border-border bg-muted text-muted-foreground";
}

export function StaffDocumentsEditor({ staffId }: { staffId: string }) {
  const db = useRDashStore((state) => state.db);
  const registerStaffDocument = useRDashStore((state) => state.registerStaffDocument);
  const updateStaffDocument = useRDashStore((state) => state.updateStaffDocument);
  const removeStaffDocument = useRDashStore((state) => state.removeStaffDocument);
  const awaitServerSync = useRDashStore((state) => state.awaitServerSync);
  const [documentType, setDocumentType] = React.useState<StaffDocument["document_type"]>("photo");
  const [label, setLabel] = React.useState("");
  const [documentNo, setDocumentNo] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const documents = React.useMemo(
    () => (db.staffDocuments || []).filter((row) => row.staff_id === staffId),
    [db.staffDocuments, staffId],
  );
  const assets = React.useMemo(
    () => new Map((db.master.fileAssets || []).map((asset) => [asset.id, asset])),
    [db.master.fileAssets],
  );

  async function cleanupUpload(result: UploadResponse) {
    await fetch("/api/staff-documents/delete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId, path: result.path }),
    }).catch(() => undefined);
  }

  async function uploadDocument() {
    if (!file) return toast.error("Choose a document to upload.");
    setUploading(true);
    let uploaded: UploadResponse | null = null;
    try {
      const body = new FormData();
      body.set("staffId", staffId);
      body.set("file", file);
      const response = await fetch("/api/staff-documents/upload", {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      uploaded = await response.json().catch(() => ({})) as UploadResponse;
      if (!response.ok) throw new Error(uploaded.error || "Document upload failed.");

      registerStaffDocument({
        staffId,
        documentType,
        label,
        documentNo,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSizeBytes: uploaded.sizeBytes,
        storageBucket: uploaded.bucket,
        storagePath: uploaded.path,
        webViewLink: uploaded.webViewLink,
      });
      await awaitServerSync();
      setLabel("");
      setDocumentNo("");
      setFile(null);
      toast.success("Staff document uploaded and saved.");
    } catch (error) {
      if (uploaded?.path) await cleanupUpload(uploaded);
      toast.error(error instanceof Error ? error.message : "Document upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeDocument(document: StaffDocument) {
    const asset = document.file_asset_id ? assets.get(document.file_asset_id) : undefined;
    try {
      removeStaffDocument(document.id);
      await awaitServerSync();
      if (asset?.storage_provider === "supabase_storage" && asset.storage_path) {
        const response = await fetch("/api/staff-documents/delete", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staffId, path: asset.storage_path }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error || "Document metadata was removed, but storage cleanup failed.");
        }
      }
      toast.success("Staff document removed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove document.");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-muted/10 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold">Upload staff document</p>
          <p className="text-[11px] text-muted-foreground">Private files are stored in Supabase Storage and linked to the canonical staff document record.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs">
            <span className="font-semibold text-muted-foreground">Document type</span>
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value as StaffDocument["document_type"])} className="h-9 rounded-md border border-input bg-background px-3">
              {documentTypes.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-semibold text-muted-foreground">Label</span>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Current ID" className="h-9"/>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-semibold text-muted-foreground">Document number</span>
            <Input value={documentNo} onChange={(event) => setDocumentNo(event.target.value)} placeholder="Optional" className="h-9"/>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-semibold text-muted-foreground">File</span>
            <Input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} className="h-9 file:text-xs"/>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => void uploadDocument()} disabled={!file || uploading}>
            <Upload className="mr-1.5 h-3.5 w-3.5"/>{uploading ? "Uploading…" : "Upload document"}
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between bg-muted/30 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Saved documents</p>
            <p className="text-[11px] text-muted-foreground">{documents.length} document{documents.length === 1 ? "" : "s"} linked to this Staff profile.</p>
          </div>
        </div>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 opacity-30"/>
            <p className="mt-2 text-xs">No staff documents uploaded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {documents.map((document) => {
              const asset = document.file_asset_id ? assets.get(document.file_asset_id) : undefined;
              const typeLabel = documentTypes.find(([value]) => value === document.document_type)?.[1] || "Document";
              return (
                <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{document.label || typeLabel}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{asset?.file_name || "File metadata unavailable"}{document.document_no ? " · " + document.document_no : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge label={document.status} className={statusTone(document.status)}/>
                    {asset?.web_view_link ? (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={asset.web_view_link} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5"/>Open</a>
                      </Button>
                    ) : null}
                    {document.status !== "verified" && <Button size="sm" variant="ghost" onClick={() => updateStaffDocument(document.id, { status: "verified" })}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Verify</Button>}
                    {document.status !== "rejected" && <Button size="sm" variant="ghost" onClick={() => updateStaffDocument(document.id, { status: "rejected" })}><XCircle className="mr-1 h-3.5 w-3.5"/>Reject</Button>}
                    <Button size="sm" variant="ghost" onClick={() => void removeDocument(document)}><Trash2 className="mr-1 h-3.5 w-3.5"/>Remove</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
