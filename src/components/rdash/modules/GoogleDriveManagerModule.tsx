"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import type { FileAsset, StorageAccount, StorageFolderInstance, StorageFolderTemplate } from "@/lib/rdash/types";
import { accountIsAtSwitchThreshold, selectWriteStorageAccount } from "@/lib/rdash/storage";
import { FilePreview } from "../FilePreview";
import { cn } from "@/lib/utils";
import {
  HardDrive, Plus, RefreshCw, ExternalLink, ShieldCheck, AlertTriangle, CheckCircle2,
  KeyRound, FolderCog, Eye, EyeOff, Save, ArrowRight, Cloud, Lock, Copy, HelpCircle,
  Settings2, UploadCloud, Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type OAuthConfig = {
  clientId: string;
  hasClientSecret: boolean;
  configured: boolean;
  redirectUri: string;
  updatedAt: string | null;
  connections?: Array<{
    id: string;
    email?: string;
    googleAccountId?: string;
    createdAt: string;
    updatedAt: string;
  }>;
};
type Tab = "overview" | "connect" | "oauth" | "guide";
type AccessPolicy = "internal" | "customer" | "vendor" | "contractor";
const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const isHttpUrl = (v?: string) => /^https:\/\//.test(v || "");

export function GoogleDriveManagerModule() {
  const db = useRDashStore((s) => s.db);
  const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
  const openDetail = useRDashStore((s) => s.openDetail);
  const mutateMaster = useRDashStore((s) => s.mutateMaster);
  const isOwner = role === "Owner";
  const [tab, setTab] = React.useState<Tab>("overview");
  const [config, setConfig] = React.useState<OAuthConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  // OAuth form
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [showSecret, setShowSecret] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Connect form
  const [driveLabel, setDriveLabel] = React.useState("");
  const [working, setWorking] = React.useState(false);

  // Storage settings (imported from DriveStorageView)
  const [accessPolicy, setAccessPolicy] = React.useState<AccessPolicy>("internal");
  const [fileDraft, setFileDraft] = React.useState({ accountId: "", name: "", kind: "document", url: "", googleFileId: "", tags: "" });

  const accounts = db.master.storageAccounts || [];
  const serverConnections = config?.connections || [];
  const mappedConnectionIds = new Set(accounts.map((account) => account.oauth_connection_id).filter(Boolean));
  const orphanConnections = serverConnections.filter((connection) => !mappedConnectionIds.has(connection.id));
  const templates = db.master.storageFolderTemplates || [];
  const instances = db.master.storageFolderInstances || [];
  const files = (db.master.fileAssets || []).filter((f: FileAsset) => f.status === "active");
  const writeDestination = selectWriteStorageAccount({ storageAccounts: accounts });
  const lastUploaded = [...files].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const threshold = writeDestination?.switch_threshold_percent || accounts[0]?.switch_threshold_percent || 85;
  const rootFolderName = writeDestination?.root_folder_name || accounts[0]?.root_folder_name || "UrbanInteriorOS Media";

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/google-drive/oauth/config", { cache: "no-store" });
        const payload = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (resp.ok) { setConfig(payload); setClientId(payload.clientId || ""); }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Actions (imported from DriveStorageView) ──
  const updateAccount = (accountId: string, patch: Partial<StorageAccount>) => mutateMaster((m) => ({
    ...m, storageAccounts: (m.storageAccounts || []).map((i: StorageAccount) => i.id === accountId ? { ...i, ...patch, updated_at: now() } : i),
  }));
  const updateThresholdForAll = (value: number) => mutateMaster((m) => ({
    ...m, storageAccounts: (m.storageAccounts || []).map((i: StorageAccount) => ({ ...i, switch_threshold_percent: value, updated_at: now() })),
  }));
  const activateAccount = (accountId: string) => {
    const ordered = [accountId, ...accounts.filter((i) => i.id !== accountId).sort((a, b) => a.priority_order - b.priority_order).map((i) => i.id)];
    mutateMaster((m) => ({
      ...m, storageAccounts: (m.storageAccounts || []).map((i: StorageAccount) => ({
        ...i, priority_order: ordered.indexOf(i.id) + 1,
        status: i.id === accountId ? "connected" : i.status,
        write_enabled: i.id === accountId ? true : i.write_enabled, updated_at: now(),
      })),
    }));
    toast.success("New uploads will prefer this Drive when it is under threshold");
  };
  const connectConnection = async (label: string, connectionId?: string) => {
    const cleaned = label.trim();
    if (!cleaned) return toast.error("Enter a clear name for this Google Drive account");
    if (!connectionId && accounts.some((account) => account.label.trim().toLowerCase() === cleaned.toLowerCase())) {
      return toast.error("That Drive label is already in use. Choose a unique label for the new Google account.");
    }
    try {
      const cfgResp = await fetch("/api/google-drive/oauth/config", { cache: "no-store" });
      const cfg = await cfgResp.json().catch(() => ({})) as { configured?: boolean };
      if (!cfg.configured) {
        toast.error("Google Drive OAuth is not configured. Go to the Google Setup tab.");
        setTab("oauth");
        return;
      }
      toast.info(
        connectionId
          ? `Reconnecting ${cleaned}. Choose the same Google account shown for this Drive slot.`
          : `Connecting ${cleaned}. Complete consent for one Google account only.`,
        { duration: 5000 },
      );
    } catch { /* proceed */ }
    const params = new URLSearchParams({ label: cleaned, returnTo: "/" });
    if (connectionId) params.set("connectionId", connectionId);
    window.location.assign(`/api/drive/connect?${params.toString()}`);
  };
  const refreshAccount = async (accountId: string) => {
    setWorking(true);
    try {
      const r = await fetch("/api/google-drive/refresh-account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId }) });
      const p = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(p.error || "Could not refresh Google Drive quota.");
      toast.success("Google Drive quota refreshed");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Refresh failed."); }
    finally { setWorking(false); }
  };
  const runTestUpload = async () => {
    if (!writeDestination) return toast.error("No active Drive is available for a test upload");
    setWorking(true);
    try {
      const r = await fetch("/api/google-drive/test-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: writeDestination.id, accessPolicy }) });
      const p = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(p.error || "Test upload failed");
      toast.success(`Test file uploaded to ${writeDestination.label}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Test upload failed"); }
    finally { setWorking(false); }
  };
  const createFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileDraft.accountId || !fileDraft.name.trim() || !isHttpUrl(fileDraft.url)) return toast.error("Choose the Drive account and enter a valid file link");
    const ts = now();
    const row: FileAsset = {
      id: makeId("drivefile"), storage_account_id: fileDraft.accountId,
      google_file_id: fileDraft.googleFileId.trim() || undefined, file_name: fileDraft.name.trim(),
      kind: fileDraft.kind as FileAsset["kind"], web_view_link: fileDraft.url.trim(),
      storage_provider: "google_drive", storage_mode: "external_reference", sync_status: "uploaded",
      tags: fileDraft.tags.split(",").map((t) => t.trim()).filter(Boolean), status: "active", created_at: ts, updated_at: ts,
    };
    mutateMaster((m) => ({ ...m, fileAssets: [...(m.fileAssets || []), row] }));
    setFileDraft((c) => ({ ...c, name: "", kind: "document", url: "", googleFileId: "", tags: "" }));
    toast.success("Existing Drive file registered without moving or copying it");
  };
  const archiveFile = (fileId: string) => mutateMaster((m) => ({
    ...m, fileAssets: (m.fileAssets || []).map((i: FileAsset) => i.id === fileId ? { ...i, status: "archived", updated_at: now() } : i),
  }));

  // OAuth save
  const saveConfig = async () => {
    if (!clientId.trim()) return toast.error("Client ID is required.");
    if (!clientSecret.trim() && !config?.hasClientSecret) return toast.error("Client Secret is required.");
    setSaving(true);
    try {
      const body: Record<string, string> = { clientId: clientId.trim() };
      if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
      const r = await fetch("/api/google-drive/oauth/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const p = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(p.error || "Could not save OAuth config.");
      setConfig(p); setClientSecret("");
      toast.success("Google Drive credentials saved. Add each Drive account separately from the Add Drive Account tab.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed."); }
    finally { setSaving(false); }
  };
  const copyRedirectUri = () => { if (config?.redirectUri) { navigator.clipboard.writeText(config.redirectUri); toast.success("Redirect URI copied."); } };

  if (loading) return <div className="flex h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const tabs: Array<[Tab, string, React.ComponentType<{ className?: string }>]> = [
    ["overview", "Overview", HardDrive],
    ["connect", "Add Drive Account", Plus],
    ["oauth", "Google Setup", KeyRound],
    ["guide", "Setup Help", HelpCircle],
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Cloud className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Files & Storage</h2>
            <p className="text-xs text-muted-foreground">Manage files and Google Drive accounts across your Urban Castle workspace.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config?.configured ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> OAuth credentials saved</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning"><AlertTriangle className="h-3.5 w-3.5" /> OAuth credentials missing</span>
          )}
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">{accounts.length} Drive account{accounts.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1.5 shadow-sm">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW / STORAGE tab (merged DriveStorageView) ── */}
      {tab === "overview" && (
        <div className="grid gap-4">
          {/* Storage Settings section */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold"><Settings2 className="h-4 w-4 text-primary" /> Storage Settings</h3>
                <p className="mt-1 max-w-4xl text-xs text-muted-foreground">Choose where new files are uploaded and when Urban Castle should move future uploads to the next connected Drive account. Existing file links remain unchanged.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={runTestUpload} disabled={working || !writeDestination}><UploadCloud className="mr-1 h-3.5 w-3.5" />Upload Test File</Button>
                <span className={cn("rounded-md px-3 py-2 text-xs font-semibold", working ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{working ? "Working..." : "Ready"}</span>
              </div>
            </div>
            {/* Local storage fallback info */}
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-3 py-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><HardDrive className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Local storage fallback is active</p>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">When no Google Drive is connected (or an upload fails), files are saved to the server's local <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">download/uploads/</code> directory. Connect a Drive to enable cloud uploads.</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">{files.filter((f) => f.storage_provider === "local").length} local file(s)</span>
            </div>
            {/* Settings grid */}
            <div className="mt-4 grid gap-2 md:grid-cols-5">
              <Field label="Default Drive Root Folder"><Input value={rootFolderName} readOnly /></Field>
              <Field label="Auto-switch Threshold"><select value={String(threshold)} onChange={(e) => updateThresholdForAll(Number(e.target.value))} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">{[75, 80, 85, 90, 95].map((i) => <option key={i} value={i}>{i}% - {i <= 85 ? "safer" : "higher risk"}</option>)}</select></Field>
              <Field label="File Access"><select value={accessPolicy} onChange={(e) => setAccessPolicy(e.target.value as AccessPolicy)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"><option value="internal">Private - Google account only</option><option value="customer">Customer-shareable</option><option value="vendor">Vendor restricted</option><option value="contractor">Contractor restricted</option></select></Field>
              <Field label="Current Role"><Input value={role} readOnly /></Field>
              <Field label="Upload Destination"><Input value={writeDestination?.label || "No eligible Drive"} readOnly /></Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => toast.success("Drive settings saved in workspace data")}>Save Settings</Button>
              <p className="self-center text-xs text-muted-foreground">Add more Google accounts from the Add Drive Account tab.</p>
              <Button size="sm" variant="outline" disabled={!writeDestination || working} onClick={() => writeDestination && refreshAccount(writeDestination.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Check Storage & Select Drive</Button>
              <Button size="sm" variant="ghost" disabled={!lastUploaded?.web_view_link} onClick={() => lastUploaded?.web_view_link && window.open(lastUploaded.web_view_link, "_blank", "noopener,noreferrer")}>Open last uploaded file</Button>
            </div>
            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <p className="font-semibold">Status:</p>
              <p className="mt-1 text-muted-foreground">{writeDestination ? `${writeDestination.label} receives new uploads. ${accounts.filter((a) => a.status === "connected").length} Drive account(s) remain connected for old files.` : "No active Drive is under the configured threshold."}</p>
              {accounts.some((a) => accountIsAtSwitchThreshold(a)) ? <p className="mt-1 text-warning">Auto-selected next Drive because at least one Drive is at or above threshold.</p> : null}
            </div>
          </section>

          {/* Drive Accounts table */}
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-bold">Drive Accounts</h3><p className="mt-0.5 text-xs text-muted-foreground">Only the active Drive receives new uploads. Reorder by priority; pause or disable a Drive without breaking old links.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs md:min-w-[900px]">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Active</th><th className="px-4 py-3">Drive account</th><th className="px-4 py-3">Storage</th><th className="px-4 py-3">Priority / status</th><th className="px-4 py-3">Actions</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {accounts.map((account) => {
                    const isDest = writeDestination?.id === account.id;
                    const ownFiles = files.filter((f) => f.storage_account_id === account.id);
                    return (
                      <tr key={account.id} className={isDest ? "bg-primary/[0.035]" : undefined}>
                        <td className="px-4 py-4 align-top">{isDest ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"><CheckCircle2 className="h-3 w-3" /> Active</span> : <Button size="sm" variant="outline" className="h-8 px-3 text-[11px]" onClick={() => activateAccount(account.id)}>Use</Button>}</td>
                        <td className="px-4 py-4 align-top"><div className="flex gap-2"><span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><HardDrive className="h-4 w-4" /></span><div className="min-w-0"><p className="font-bold">{account.label}</p><p className="truncate text-[11px] text-muted-foreground">{account.email || "Google account identity pending"} · Folder: {account.root_folder_name || "Urban Castle"}</p><p className="mt-1 text-[10px] text-muted-foreground">{ownFiles.length} active file(s) linked here</p></div></div></td>
                        <td className="w-[220px] px-4 py-4 align-top"><Capacity account={account} /></td>
                        <td className="w-[240px] px-4 py-4 align-top"><div className="grid gap-2"><Input type="number" min={1} className="h-9" value={account.priority_order} onChange={(e) => updateAccount(account.id, { priority_order: Math.max(1, Number(e.target.value) || 1) })} /><select value={account.status} onChange={(e) => updateAccount(account.id, { status: e.target.value as StorageAccount["status"], write_enabled: e.target.value === "connected" })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"><option value="connected">Connected</option><option value="paused">Standby</option><option value="reconnect_required">Reconnect required</option><option value="disabled">Disabled</option></select></div></td>
                        <td className="px-4 py-4 align-top"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={working || !account.oauth_connection_id} onClick={() => refreshAccount(account.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Refresh quota</Button><Button size="sm" variant="outline" disabled={working || !isOwner} onClick={() => connectConnection(account.label, account.oauth_connection_id)}><KeyRound className="mr-1 h-3.5 w-3.5" />{account.oauth_connection_id ? "Reconnect same account" : "Authorize account"}</Button><Button size="sm" variant="ghost" onClick={() => updateAccount(account.id, { status: "disabled", write_enabled: false })}>Disable</Button>{account.web_view_link ? <Button size="sm" variant="ghost" onClick={() => window.open(account.web_view_link, "_blank", "noopener,noreferrer")}><ExternalLink className="h-3.5 w-3.5" /></Button> : null}</div><p className="mt-2 max-w-xs text-[10px] text-muted-foreground">{accountIsAtSwitchThreshold(account) ? "Threshold reached: new uploads route onward; existing files remain connected here." : "Existing files remain available from this Drive even after another Drive becomes the upload destination."}</p></td>
                      </tr>
                    );
                  })}
                  {!accounts.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">No Drive accounts connected. Go to Add Drive Account to start cloud storage.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* All Files + Register existing file */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4">
              {/* Unified multi-Drive pool */}
              <section className="rounded-xl border border-primary/25 bg-primary/[0.035] p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-sm font-bold">Storage Pool</h3><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Urban Castle uses your connected Drive accounts as one storage pool. New uploads move to the next available Drive when the current upload Drive reaches its threshold. Existing files remain in their original account and folder.</p></div>
                  <div className="rounded-md border border-primary/20 bg-card px-3 py-2 text-right"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Current Upload Drive</p><p className="mt-0.5 text-sm font-bold">{writeDestination?.label || "No eligible Drive"}</p></div>
                </div>
              </section>

              {/* File library */}
              <section className="rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h3 className="text-sm font-bold">All Files</h3><p className="text-[11px] text-muted-foreground">Business links point to the exact original file; no catalogue, proof, bill, or invoice is copied when it is reused elsewhere.</p></div><span className="text-xs text-muted-foreground">{files.length} active</span></div>
                <div className="max-h-96 divide-y divide-border overflow-y-auto">
                  {files.map((item) => { const parent = accounts.find((a) => a.id === item.storage_account_id); const links = (db.entityFileAttachments || []).filter((l: any) => l.file_asset_id === item.id); return (
                    <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <FilePreview file={{ fileName: item.file_name, mimeType: item.mime_type, googleFileId: item.storage_mode === "managed" ? item.google_file_id : undefined, url: item.web_view_link, thumbnailUrl: item.thumbnail_url }} compact controls={false} className="mt-0.5 w-20 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.file_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{item.kind.replaceAll("_", " ")} · {parent?.label || "External Drive file"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {item.web_view_link ? <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => window.open(item.web_view_link, "_blank", "noopener,noreferrer")}>Open in Google Drive</Button> : null}
                          <button onClick={() => openDetail("media" as any, item.id)} className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10">View Usage</button>
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{links.length} business link(s)</span>
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", item.storage_mode === "managed" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{item.storage_mode === "managed" ? "Managed upload" : "Existing Drive file"}</span>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" aria-label={`Archive ${item.file_name}`} onClick={() => archiveFile(item.id)}><Archive className="h-4 w-4 text-muted-foreground" /></Button>
                    </div>
                  ); })}
                  {!files.length ? <p className="p-6 text-center text-xs text-muted-foreground">No files added yet. Add an existing file from a connected Drive using the form on the right.</p> : null}
                </div>
              </section>
            </div>

            {/* Register existing file form */}
            <aside className="grid content-start gap-4">
              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold"><UploadCloud className="h-3.5 w-3.5" /> Add Existing File</h3>
                <form onSubmit={createFile} className="grid gap-2">
                  <p className="text-[10px] text-muted-foreground">Add a file that already exists in a connected Drive. Urban Castle links to the original without copying or moving it.</p>
                  <Field label="Original Drive account"><select value={fileDraft.accountId} onChange={(e) => setFileDraft({ ...fileDraft, accountId: e.target.value })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"><option value="">Select connected account</option>{accounts.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select></Field>
                  <Field label="File name"><Input value={fileDraft.name} onChange={(e) => setFileDraft({ ...fileDraft, name: e.target.value })} placeholder="Supplier catalogue.pdf" /></Field>
                  <Field label="Kind"><select value={fileDraft.kind} onChange={(e) => setFileDraft({ ...fileDraft, kind: e.target.value })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">{["document", "media", "catalogue", "drawing", "site_proof", "other"].map((i) => <option key={i} value={i}>{i.replaceAll("_", " ")}</option>)}</select></Field>
                  <Field label="Google Drive share link"><Input required value={fileDraft.url} onChange={(e) => setFileDraft({ ...fileDraft, url: e.target.value })} placeholder="https://drive.google.com/..." /></Field>
                  <Field label="Google file ID (optional)"><Input value={fileDraft.googleFileId} onChange={(e) => setFileDraft({ ...fileDraft, googleFileId: e.target.value })} /></Field>
                  <Field label="Tags"><Input value={fileDraft.tags} onChange={(e) => setFileDraft({ ...fileDraft, tags: e.target.value })} placeholder="catalogue, zebra blind" /></Field>
                  <Button size="sm" type="submit"><UploadCloud className="mr-1 h-3.5 w-3.5" />Add Existing File</Button>
                </form>
              </section>
            </aside>
          </div>
        </div>
      )}

      {/* ── CONNECT tab ── */}
      {tab === "connect" && (
        <div className="space-y-4">
          {!config?.configured ? (
            <div className="rounded-xl border border-warning/40 bg-warning/[0.08] p-4">
              <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" /><div className="flex-1"><p className="text-sm font-bold text-warning">OAuth not configured yet</p><p className="mt-1 text-xs text-muted-foreground">Before adding a Drive account, complete Google Setup and save your Client ID and Client Secret.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => setTab("oauth")}><KeyRound className="mr-1.5 h-3.5 w-3.5" /> Go to Google Setup</Button></div></div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold">Add one Drive account</h3>
              <div className="mb-4 rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
                <p className="text-xs font-bold text-foreground">One Drive slot = one Google account authorization</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Finish Google consent for one account before adding the next. Repeat this flow for every additional Google account. If the same Google identity is authorized again, Urban Castle reuses its existing server connection instead of creating a duplicate slot.</p>
              </div>
              {accounts.length ? (
                <div className="mb-4 grid gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Already connected in this workspace</p>
                  {accounts.map((account) => (
                    <div key={account.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
                      <span className="font-semibold">{account.label}</span>
                      <span className="text-muted-foreground">{account.email || "Google identity pending"} · {account.status.replaceAll("_", " ")}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {orphanConnections.length ? (
                <div className="mb-4 rounded-lg border border-warning/35 bg-warning/[0.08] p-3 text-xs">
                  <p className="font-bold text-warning">{orphanConnections.length} server authorization{orphanConnections.length === 1 ? "" : "s"} need workspace recovery</p>
                  <p className="mt-1 text-muted-foreground">Reconnect the same Google account shown below. Its existing secure connection will be reused and restored to the workspace; it will not create another Drive identity.</p>
                  <ul className="mt-2 space-y-1">{orphanConnections.map((connection) => <li key={connection.id} className="font-mono text-[11px]">{connection.email || connection.id}</li>)}</ul>
                </div>
              ) : null}
              <p className="mb-4 text-xs text-muted-foreground">Choose a unique workspace label, then select the Google account that belongs to this Drive slot on Google’s consent screen.</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid w-full max-w-sm gap-1.5"><Label className="text-xs font-medium">Drive label</Label><Input value={driveLabel} onChange={(e) => setDriveLabel(e.target.value)} placeholder={`Urban Drive ${accounts.length + 1}`} className="h-9" /></div>
                <Button onClick={() => connectConnection(driveLabel || `Urban Drive ${accounts.length + 1}`)} disabled={!isOwner || working}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add Drive Account</Button>
              </div>
              {!isOwner && <p className="mt-2 text-xs text-destructive">Only the Owner can connect Google Drive accounts.</p>}
            </div>
          )}
          {/* How it works */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <h3 className="mb-2 text-sm font-bold">How Drive account setup works</h3>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">1</span><span>Owner saves Google OAuth Client ID + Client Secret in the <b>Google Setup</b> tab (stored in Supabase).</span></li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">2</span><span>Owner clicks "Add Drive Account" → redirected to Google's consent screen.</span></li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">3</span><span>Google returns a <b>refresh token</b> → stored in Supabase <code className="rounded bg-muted px-1">GenericRecord</code> table.</span></li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">4</span><span>Urban Castle records Google’s stable account identity and refuses to replace an existing Drive slot with a different Google account.</span></li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">5</span><span>A dedicated <code className="rounded bg-muted px-1">StorageAccount</code> links that identity, token, root folder, quota and files. Repeat steps 2–5 separately for each additional Drive.</span></li>
              <li className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">6</span><span>The app refreshes each Drive’s access token independently; tokens and files never move between Drive slots.</span></li>
            </ol>
          </div>
        </div>
      )}

      {/* ── OAUTH tab ── */}
      {tab === "oauth" && (
        <div className="space-y-4">
          {!isOwner ? (
            <div className="rounded-xl border border-border bg-muted/20 p-6 text-center"><Lock className="mx-auto h-8 w-8 text-muted-foreground/40" /><p className="mt-2 text-sm font-semibold text-muted-foreground">Owner access required</p><p className="text-xs text-muted-foreground/70">Only the Owner can view and edit Google OAuth credentials.</p></div>
          ) : (
            <>
              {config?.redirectUri && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h3 className="text-sm font-bold">Authorized Redirect URI</h3></div>
                  <p className="mb-2 text-xs text-muted-foreground">Copy this exact URI and add it to your Google Cloud Console → Credentials → OAuth 2.0 Client → Authorized redirect URIs.</p>
                  <div className="flex items-center gap-2"><code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">{config.redirectUri}</code><Button size="sm" variant="outline" onClick={copyRedirectUri}><Copy className="mr-1 h-3.5 w-3.5" /> Copy</Button></div>
                </div>
              )}
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold">Google OAuth Credentials</h3><p className="text-xs text-muted-foreground">{config?.hasClientSecret ? "Client Secret is set. Enter a new value only to replace it." : "Enter your Google OAuth Client ID and Client Secret."}</p><p className="mt-1 text-[11px] text-muted-foreground">This is one app-level credential set shared by the connection flow. Individual Drive accounts are authorized separately in Add Drive Account.</p></div>{config?.updatedAt && <span className="text-[10px] text-muted-foreground">Updated {new Date(config.updatedAt).toLocaleDateString("en-IN")}</span>}</div>
                <div className="space-y-4">
                  <div className="grid gap-1.5"><Label className="text-xs font-medium">Client ID</Label><Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="123456789-abcdef.apps.googleusercontent.com" className="h-9 font-mono text-xs" /></div>
                  <div className="grid gap-1.5"><Label className="text-xs font-medium">Client Secret {config?.hasClientSecret && <span className="text-success">(configured)</span>}</Label><div className="relative"><Input type={showSecret ? "text" : "password"} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={config?.hasClientSecret ? "•••••••• (enter new to replace)" : "GOCSPX-xxxxxxxxxxxxxxxx"} className="h-9 pr-10 font-mono text-xs" /><button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                  <div className="flex flex-wrap gap-2"><Button onClick={saveConfig} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Credentials"}</Button><Button variant="outline" onClick={() => setTab("connect")} disabled={saving || !config?.configured}><ArrowRight className="mr-1.5 h-3.5 w-3.5" /> Next: Add Drive Account</Button></div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── GUIDE tab ── */}
      {tab === "guide" && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold">Step-by-step: Add Google Drive to Urban Castle</h3>
          <div className="space-y-5">
            {[
              { t: "Create a Google Cloud Project", d: 'Go to Google Cloud Console → create a new project (or select existing).' },
              { t: "Enable Google Drive API", d: "In the Cloud Console → APIs & Services → Library → search 'Google Drive API' → click Enable." },
              { t: "Configure OAuth Consent Screen", d: "Go to APIs & Services → OAuth consent screen. User type: External. Fill in app name, support email. Add scope: https://www.googleapis.com/auth/drive. Add your email as a Test User." },
              { t: "Create OAuth 2.0 Client ID", d: "Go to APIs & Services → Credentials → Create Credentials → OAuth client ID. Application type: Web application. Add the Redirect URI from the Google Setup tab. Copy the Client ID and Client Secret." },
              { t: "Save credentials in Urban Castle", d: "Go to Google Setup → paste the Client ID and Client Secret → click Save Credentials. These are stored in Supabase." },
              { t: "Connect the first Google Drive", d: "Go to Add Drive Account → enter a unique label → authorize exactly one Google account. Its identity, token, root folder and quota stay bound to that Drive slot." },
              { t: "Add more Drives individually", d: "Repeat Add Drive Account once for every additional Google account. Select the correct account each time. Reauthorizing the same Google identity restores or refreshes its existing slot instead of creating a duplicate." },
            ].map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{i + 1}</div>
                <div className="flex-1"><h4 className="text-sm font-bold">{step.t}</h4><p className="mt-1 text-xs text-muted-foreground">{step.d}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper components (imported from DriveStorageView) ──
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
function Capacity({ account }: { account: StorageAccount }) {
  const used = account.quota_used_bytes || 0;
  const limit = account.quota_limit_bytes || 0;
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", pct > 85 ? "bg-destructive" : pct > 60 ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <p className="mt-1 text-[10px] font-mono text-muted-foreground">{formatBytes(used)} / {formatBytes(limit)}</p>
    </div>
  );
}
function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
