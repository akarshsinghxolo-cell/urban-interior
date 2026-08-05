"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import type { FileAsset, StorageAccount } from "@/lib/rdash/types";
import { accountIsAtSwitchThreshold, selectWriteStorageAccount } from "@/lib/rdash/storage";
import { FilePreview } from "../FilePreview";
import { cn } from "@/lib/utils";
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  HardDrive,
  HelpCircle,
  KeyRound,
  Plus,
  RefreshCw,
  Settings2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type OAuthConfig = {
  clientId: string;
  hasClientSecret: boolean;
  hasCredentialsKey: boolean;
  configured: boolean;
  configurationSource?: "environment";
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

const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const isHttpUrl = (v?: string) => /^https:\/\//.test(v || "");

function authorizedOpenUrl(file?: FileAsset) {
  if (!file) return "";
  if (file.storage_mode === "managed" && file.google_file_id) {
    return `/api/google-drive/open?fileId=${encodeURIComponent(file.google_file_id)}`;
  }
  return file.web_view_link || "";
}

export function GoogleDriveManagerModule() {
  const db = useRDashStore((s) => s.db);
  const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
  const openDetail = useRDashStore((s) => s.openDetail);
  const mutateMaster = useRDashStore((s) => s.mutateMaster);
  const isOwner = role === "Owner";
  const [tab, setTab] = React.useState<Tab>("overview");
  const [config, setConfig] = React.useState<OAuthConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [driveLabel, setDriveLabel] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const [fileDraft, setFileDraft] = React.useState({ accountId: "", name: "", kind: "document", url: "", googleFileId: "", tags: "" });

  const accounts = db.master.storageAccounts || [];
  const serverConnections = config?.connections || [];
  const mappedConnectionIds = new Set(accounts.map((account) => account.oauth_connection_id).filter(Boolean));
  const orphanConnections = serverConnections.filter((connection) => !mappedConnectionIds.has(connection.id));
  const files = (db.master.fileAssets || []).filter((f: FileAsset) => f.status === "active");
  const writeDestination = selectWriteStorageAccount({ storageAccounts: accounts });
  const lastUploaded = [...files].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

  const loadConfig = React.useCallback(async () => {
    const resp = await fetch("/api/google-drive/oauth/config", { cache: "no-store" });
    const payload = await resp.json().catch(() => ({})) as OAuthConfig & { error?: string };
    if (!resp.ok) throw new Error(payload.error || "Could not load Google Drive OAuth config.");
    setConfig(payload);
    return payload;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/google-drive/oauth/config", { cache: "no-store" });
        const payload = await resp.json().catch(() => ({})) as OAuthConfig;
        if (!cancelled && resp.ok) setConfig(payload);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateAccount = (accountId: string, patch: Partial<StorageAccount>) => mutateMaster((m) => ({
    ...m,
    storageAccounts: (m.storageAccounts || []).map((i: StorageAccount) => i.id === accountId ? { ...i, ...patch, updated_at: now() } : i),
  }));

  const updateThresholdForAll = (value: number) => mutateMaster((m) => ({
    ...m,
    storageAccounts: (m.storageAccounts || []).map((i: StorageAccount) => ({ ...i, switch_threshold_percent: value, updated_at: now() })),
  }));

  const activateAccount = (accountId: string) => {
    const ordered = [accountId, ...accounts.filter((i) => i.id !== accountId).sort((a, b) => a.priority_order - b.priority_order).map((i) => i.id)];
    mutateMaster((m) => ({
      ...m,
      storageAccounts: (m.storageAccounts || []).map((i: StorageAccount) => ({
        ...i,
        priority_order: ordered.indexOf(i.id) + 1,
        status: i.id === accountId ? "connected" : i.status,
        write_enabled: i.id === accountId ? true : i.write_enabled,
        updated_at: now(),
      })),
    }));
    toast.success("New uploads will prefer this Drive when it is under threshold");
  };

  const connectConnection = async (label: string, connectionId?: string) => {
    const cleaned = label.trim();
    if (!isOwner) return toast.error("Only Owner can connect Google Drive accounts.");
    if (!cleaned) return toast.error("Enter a clear name for this Google Drive account");
    if (!connectionId && accounts.some((account) => account.label.trim().toLowerCase() === cleaned.toLowerCase())) {
      return toast.error("That Drive label is already in use. Choose a unique label for the new Google account.");
    }
    try {
      const freshConfig = await loadConfig();
      if (!freshConfig.configured) {
        toast.error("Google Drive OAuth is not configured in Vercel environment variables.");
        setTab("oauth");
        return;
      }
    } catch (error) {
      setTab("oauth");
      return toast.error(error instanceof Error ? error.message : "Google Drive OAuth is not configured.");
    }
    toast.info(connectionId ? `Reconnecting ${cleaned}. Choose the same Google account shown for this Drive slot.` : `Connecting ${cleaned}. Complete consent for one Google account only.`, { duration: 5000 });
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setWorking(false);
    }
  };

  const runTestUpload = async () => {
    if (!writeDestination) return toast.error("No active Drive is available for a test upload");
    setWorking(true);
    try {
      const r = await fetch("/api/google-drive/test-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: writeDestination.id }) });
      const p = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(p.error || "Test upload failed");
      toast.success(`Test file uploaded to ${writeDestination.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test upload failed");
    } finally {
      setWorking(false);
    }
  };

  const createFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileDraft.accountId || !fileDraft.name.trim() || !isHttpUrl(fileDraft.url)) return toast.error("Choose the Drive account and enter a valid file link");
    const ts = now();
    const row: FileAsset = {
      id: makeId("drivefile"),
      storage_account_id: fileDraft.accountId,
      google_file_id: fileDraft.googleFileId.trim() || undefined,
      file_name: fileDraft.name.trim(),
      kind: fileDraft.kind as FileAsset["kind"],
      web_view_link: fileDraft.url.trim(),
      storage_provider: "google_drive",
      storage_mode: "external_reference",
      sync_status: "uploaded",
      tags: fileDraft.tags.split(",").map((t) => t.trim()).filter(Boolean),
      status: "active",
      created_at: ts,
      updated_at: ts,
    };
    mutateMaster((m) => ({ ...m, fileAssets: [...(m.fileAssets || []), row] }));
    setFileDraft((c) => ({ ...c, name: "", kind: "document", url: "", googleFileId: "", tags: "" }));
    toast.success("Existing Drive file registered without moving or copying it");
  };

  const archiveFile = (fileId: string) => mutateMaster((m) => ({
    ...m,
    fileAssets: (m.fileAssets || []).map((i: FileAsset) => i.id === fileId ? { ...i, status: "archived", updated_at: now() } : i),
  }));

  const copyRedirectUri = () => {
    if (!config?.redirectUri) return;
    navigator.clipboard.writeText(config.redirectUri);
    toast.success("Redirect URI copied.");
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const tabs: Array<[Tab, string, React.ComponentType<{ className?: string }>]> = [
    ["overview", "Overview", HardDrive],
    ["connect", "Add Drive Account", Plus],
    ["oauth", "Google Setup", KeyRound],
    ["guide", "Setup Help", HelpCircle],
  ];

  return (
    <div className="flex flex-col gap-5">
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> OAuth env configured</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning"><AlertTriangle className="h-3.5 w-3.5" /> OAuth env missing</span>
          )}
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">{accounts.length} Drive account{accounts.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1.5 shadow-sm">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4">
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold"><Settings2 className="h-4 w-4 text-primary" /> Storage Settings</h3>
                <p className="mt-1 max-w-4xl text-xs text-muted-foreground">New uploads use the active Drive until it reaches the threshold. File bytes continue to upload directly to Google Drive; Vercel only authorizes and finalizes metadata.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={runTestUpload} disabled={working || !writeDestination}><UploadCloud className="mr-1 h-3.5 w-3.5" />Upload Test File</Button>
                <Button size="sm" variant="outline" disabled={!writeDestination || working} onClick={() => writeDestination && refreshAccount(writeDestination.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Check Storage</Button>
                <Button size="sm" variant="ghost" disabled={!authorizedOpenUrl(lastUploaded)} onClick={() => { const url = authorizedOpenUrl(lastUploaded); if (url) window.open(url, "_blank", "noopener,noreferrer"); }}>Open last uploaded file</Button>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-3 py-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Cloud className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">Direct Google Drive uploads</p>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">File bytes upload directly from the browser to the selected Google Drive. If no writable Drive is available, uploads stop or remain pending; Urban Castle does not fall back to Vercel local storage.</p>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/[0.06] p-3 text-xs">
              <p className="font-semibold text-warning">Managed Drive files are link-readable</p>
              <p className="mt-1 text-muted-foreground">Urban Castle authorizes before presenting managed open/download links, but finalized Drive files currently use Google “Anyone with the link” reader permission. A copied Google URL can therefore be opened outside Urban Castle. Do not use this storage mode as strong confidentiality for sensitive IDs, private contracts, or confidential financial documents.</p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <p className="font-semibold">Status:</p>
                <p className="mt-1 text-muted-foreground">{writeDestination ? `${writeDestination.label} receives new uploads. ${accounts.filter((a) => a.status === "connected").length} Drive account(s) remain connected for old files.` : "No active Drive is under the configured threshold."}</p>
                {accounts.some((a) => accountIsAtSwitchThreshold(a)) ? <p className="mt-1 text-warning">Auto-selected next Drive because at least one Drive is at or above threshold.</p> : null}
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <Label className="text-xs font-semibold">Switch threshold (%)</Label>
                <Input type="number" min={1} max={100} className="mt-2 h-9" value={writeDestination?.switch_threshold_percent || accounts[0]?.switch_threshold_percent || 85} onChange={(e) => updateThresholdForAll(Math.max(1, Math.min(100, Number(e.target.value) || 85)))} />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-bold">Drive Accounts</h3><p className="mt-0.5 text-xs text-muted-foreground">Only the active Drive receives new uploads. Pause or disable a Drive without breaking old links.</p></div>
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

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h3 className="text-sm font-bold">All Files</h3><p className="text-[11px] text-muted-foreground">Business links point to the exact original file; files are not copied when reused elsewhere.</p></div><span className="text-xs text-muted-foreground">{files.length} active</span></div>
              <div className="max-h-96 divide-y divide-border overflow-y-auto">
                {files.map((item) => { const parent = accounts.find((a) => a.id === item.storage_account_id); const links = (db.entityFileAttachments || []).filter((l: any) => l.file_asset_id === item.id); const openUrl = authorizedOpenUrl(item); return (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <FilePreview file={{ fileName: item.file_name, mimeType: item.mime_type, googleFileId: item.storage_mode === "managed" ? item.google_file_id : undefined, url: item.web_view_link, thumbnailUrl: item.thumbnail_url }} compact controls={false} className="mt-0.5 w-20 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.file_name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{item.kind.replaceAll("_", " ")} · {parent?.label || "External Drive file"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {openUrl ? <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => window.open(openUrl, "_blank", "noopener,noreferrer")}>Open in Google Drive</Button> : null}
                        <button onClick={() => openDetail("media" as any, item.id)} className="rounded border border-border px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10">View Usage</button>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{links.length} business link(s)</span>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", item.storage_mode === "managed" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{item.storage_mode === "managed" ? "Managed upload" : "Existing Drive file"}</span>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" aria-label={`Archive ${item.file_name}`} onClick={() => archiveFile(item.id)}><Archive className="h-4 w-4 text-muted-foreground" /></Button>
                  </div>
                ); })}
                {!files.length ? <p className="p-6 text-center text-xs text-muted-foreground">No files registered yet.</p> : null}
              </div>
            </section>

            <aside className="grid content-start gap-4">
              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold"><UploadCloud className="h-3.5 w-3.5" /> Register Existing Drive Link</h3>
                <form onSubmit={createFile} className="grid gap-2">
                  <p className="text-[10px] text-muted-foreground">Add a file that already exists in a connected Drive. Urban Castle links to the original without copying or moving it.</p>
                  <Field label="Original Drive account"><select value={fileDraft.accountId} onChange={(e) => setFileDraft({ ...fileDraft, accountId: e.target.value })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"><option value="">Select connected account</option>{accounts.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select></Field>
                  <Field label="File name"><Input value={fileDraft.name} onChange={(e) => setFileDraft({ ...fileDraft, name: e.target.value })} placeholder="Supplier catalogue.pdf" /></Field>
                  <Field label="Kind"><select value={fileDraft.kind} onChange={(e) => setFileDraft({ ...fileDraft, kind: e.target.value })} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">{["document", "media", "catalogue", "drawing", "site_proof", "other"].map((i) => <option key={i} value={i}>{i.replaceAll("_", " ")}</option>)}</select></Field>
                  <Field label="Google Drive share link"><Input required value={fileDraft.url} onChange={(e) => setFileDraft({ ...fileDraft, url: e.target.value })} placeholder="https://drive.google.com/..." /></Field>
                  <Field label="Google file ID (optional)"><Input value={fileDraft.googleFileId} onChange={(e) => setFileDraft({ ...fileDraft, googleFileId: e.target.value })} /></Field>
                  <Field label="Tags"><Input value={fileDraft.tags} onChange={(e) => setFileDraft({ ...fileDraft, tags: e.target.value })} placeholder="catalogue, zebra blind" /></Field>
                  <Button size="sm" type="submit"><UploadCloud className="mr-1 h-3.5 w-3.5" />Register Existing Drive Link</Button>
                </form>
              </section>
            </aside>
          </div>
        </div>
      )}

      {tab === "connect" && (
        <div className="space-y-4">
          {!config?.configured ? (
            <div className="rounded-xl border border-warning/40 bg-warning/[0.08] p-4">
              <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" /><div className="flex-1"><p className="text-sm font-bold text-warning">OAuth environment variables missing</p><p className="mt-1 text-xs text-muted-foreground">Before adding a Drive account, set the Google OAuth Client ID, Client Secret, and Drive token encryption key in Vercel environment variables.</p><Button size="sm" variant="outline" className="mt-3" onClick={() => setTab("oauth")}><KeyRound className="mr-1.5 h-3.5 w-3.5" /> Go to Google Setup</Button></div></div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold">Add one Drive account</h3>
              <div className="mb-4 rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
                <p className="text-xs font-bold text-foreground">One Drive slot = one Google account authorization</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Finish Google consent for one account before adding the next. Refresh tokens are stored only in the encrypted server vault.</p>
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
                  <p className="mt-1 text-muted-foreground">Reconnect the same Google account shown below. Its existing secure connection will be reused and restored to the workspace.</p>
                  <ul className="mt-2 space-y-1">{orphanConnections.map((connection) => <li key={connection.id} className="font-mono text-[11px]">{connection.email || connection.id}</li>)}</ul>
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid w-full max-w-sm gap-1.5"><Label className="text-xs font-medium">Drive label</Label><Input value={driveLabel} onChange={(e) => setDriveLabel(e.target.value)} placeholder="Urban Drive 1" /></div>
                <Button onClick={() => connectConnection(driveLabel)} disabled={working || !isOwner}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Drive Account</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "oauth" && (
        <div className="space-y-4">
          {!isOwner ? (
            <div className="rounded-xl border border-border bg-muted/20 p-6 text-center"><p className="text-sm font-semibold text-muted-foreground">Owner access required</p><p className="text-xs text-muted-foreground/70">Only the Owner can inspect Google OAuth environment status.</p></div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">Google OAuth Environment Setup</h3>
                  <p className="text-xs text-muted-foreground">Client secrets and token keys are no longer accepted in the browser. Store them only in Vercel environment variables.</p>
                </div>
                <Button size="sm" variant="outline" onClick={copyRedirectUri}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy redirect URI</Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <SecretStatus label="GOOGLE_DRIVE_OAUTH_CLIENT_ID" ok={Boolean(config?.clientId)} />
                <SecretStatus label="GOOGLE_DRIVE_OAUTH_CLIENT_SECRET" ok={Boolean(config?.hasClientSecret)} />
                <SecretStatus label="DRIVE_TOKEN_ENCRYPTION_KEY" ok={Boolean(config?.hasCredentialsKey)} />
              </div>
              <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <p className="font-semibold">Authorized redirect URI</p>
                <code className="mt-1 block break-all rounded bg-background px-2 py-1 font-mono text-[11px]">{config?.redirectUri || "/api/google-drive/oauth/callback"}</code>
                <p className="mt-2 text-muted-foreground">After setting or rotating any of these Vercel environment variables, redeploy the project before connecting Drive accounts.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setTab("connect")} disabled={!config?.configured}><Plus className="mr-1.5 h-3.5 w-3.5" />Next: Add Drive Account</Button>
                <Button variant="ghost" onClick={() => loadConfig().then(() => toast.success("Google Drive environment status refreshed")).catch((e) => toast.error(e instanceof Error ? e.message : "Refresh failed"))}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh status</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "guide" && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold">Step-by-step: Add Google Drive to Urban Castle</h3>
          <div className="space-y-5">
            {[
              { t: "Create a Google Cloud Project", d: "Go to Google Cloud Console and create or select a project." },
              { t: "Enable Google Drive API", d: "In APIs & Services → Library, search Google Drive API and enable it." },
              { t: "Configure OAuth Consent Screen", d: "Set app name and support email. Add the Drive scope your app requires and add your owner email as a test user while in testing mode." },
              { t: "Create OAuth 2.0 Client ID", d: "Application type: Web application. Add the Redirect URI from the Google Setup tab." },
              { t: "Save secrets in Vercel", d: "Set GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET, and DRIVE_TOKEN_ENCRYPTION_KEY in Vercel environment variables, then redeploy." },
              { t: "Connect the first Google Drive", d: "Go to Add Drive Account → enter a unique label → authorize exactly one Google account. Refresh tokens are encrypted before storage." },
              { t: "Keep file bytes direct", d: "Uploads continue to go directly from browser to Google Drive resumable sessions. Vercel should not proxy large files." },
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

function SecretStatus({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3 text-xs", ok ? "border-success/30 bg-success/10" : "border-warning/35 bg-warning/[0.08]")}>
      <p className="font-mono text-[10px] font-bold">{label}</p>
      <p className={cn("mt-1 font-semibold", ok ? "text-success" : "text-warning")}>{ok ? "Configured" : "Missing"}</p>
    </div>
  );
}

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
