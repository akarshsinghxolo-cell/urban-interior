"use client";

import * as React from "react";
import { formatBytes } from "@/lib/rdash/format";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Fingerprint,
  HardDrive,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountIsAtSwitchThreshold } from "@/lib/rdash/storage";
import { useRDashStore } from "@/lib/rdash/store";
import type { StorageAccount } from "@/lib/rdash/types";
import { cn } from "@/lib/utils";

type AccessTokenDiagnostics = {
  state: "active" | "missing" | "reconnect_required";
  fingerprint: string | null;
  verifiedAt: string | null;
  scope: string[];
  serverCacheWindowMinutes: number;
  googleAccountId?: string | null;
  email?: string | null;
  error?: string | null;
};

type DriveDiagnostics = {
  storageAccountId: string;
  label: string;
  status: string;
  email: string | null;
  googleAccountId: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  refreshToken: {
    configured: boolean;
    fingerprint: string | null;
    storage: string;
    updatedAt: string | null;
  };
  accessToken: AccessTokenDiagnostics;
};

type SecurityDiagnostics = {
  generatedAt: string;
  policy: {
    rawSecretsSentToBrowser: false;
    explanation: string;
  };
  oauthApplication: {
    clientId: string;
    configured: boolean;
    clientIdSource: string;
    clientSecret: {
      configured: boolean;
      fingerprint: string | null;
      source: string;
      storage: string;
    };
    scope: string[];
    updatedAt: string | null;
  };
  drives: DriveDiagnostics[];
};

type DriveSecurityDiagnosticsPanelProps = {
  accounts: StorageAccount[];
  activeFileCountByAccount: Record<string, number>;
  writeDestinationId?: string;
  credentialIds: ReadonlySet<string>;
  working: boolean;
  onActivate: (accountId: string) => void;
  onRefresh: (accountId: string) => void;
  onConnect: (label: string, accountId: string) => void;
  onUpdate: (accountId: string, patch: Partial<StorageAccount>) => void;
};

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}


function SecretFingerprint({ value, missingLabel = "Not configured" }: { value: string | null; missingLabel?: string }) {
  if (!value) return <span className="text-muted-foreground">{missingLabel}</span>;
  return (
    <code className="flex max-w-full min-w-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] text-foreground">
      <Fingerprint className="h-3 w-3 shrink-0 text-primary" />
      <span className="min-w-0 break-all">sha256:{value}</span>
    </code>
  );
}

function StatusPill({ state }: { state: AccessTokenDiagnostics["state"] }) {
  const active = state === "active";
  const missing = state === "missing";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
      active && "border-success/30 bg-success/10 text-success",
      missing && "border-border bg-muted text-muted-foreground",
      state === "reconnect_required" && "border-destructive/30 bg-destructive/10 text-destructive",
    )}>
      {active ? <CheckCircle2 className="h-3 w-3" /> : state === "reconnect_required" ? <XCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {state.replaceAll("_", " ")}
    </span>
  );
}

function StorageCapacity({ account }: { account: StorageAccount }) {
  const used = account.quota_used_bytes || 0;
  const limit = account.quota_limit_bytes || 0;
  const percent = limit > 0 ? Math.round((used / limit) * 100) : 0;

  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", percent > 85 ? "bg-destructive" : percent > 60 ? "bg-warning" : "bg-success")}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">{formatBytes(used)} / {formatBytes(limit)} · {percent}% used</p>
    </div>
  );
}

export function DriveSecurityDiagnosticsPanel({
  accounts,
  activeFileCountByAccount,
  writeDestinationId,
  credentialIds,
  working,
  onActivate,
  onRefresh,
  onConnect,
  onUpdate,
}: DriveSecurityDiagnosticsPanelProps) {
  const role = useRDashStore((state) => state.authUser?.role || "Unauthenticated");
  const [data, setData] = React.useState<SecurityDiagnostics | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const isOwner = role === "Owner";

  const load = React.useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/google-drive/diagnostics", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as SecurityDiagnostics & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load Drive diagnostics.");
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Drive diagnostics.");
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!isOwner) return null;

  const copyClientId = async () => {
    if (!data?.oauthApplication.clientId) return;
    await navigator.clipboard.writeText(data.oauthApplication.clientId);
    toast.success("OAuth Client ID copied");
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-primary/25 bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/[0.07] to-transparent px-4 py-3">
        <div className="flex min-w-0 max-w-full items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h3 className="break-words text-sm font-bold">Drive Credentials</h3>
            <p className="mt-0.5 max-w-4xl text-[11px] leading-4 text-muted-foreground">
              Owner-only security diagnostics for the OAuth application, every connected Drive and token health.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Checking..." : "Refresh diagnostics"}
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 p-4">
        <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">Raw credentials are intentionally server-only</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              Client Secret, OAuth access tokens and Google refresh tokens are not returned to the browser. Stable SHA-256 fingerprints let you identify and compare each value without granting access to anyone viewing the page.
            </p>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/[0.06] p-3 text-xs text-destructive">{error}</div>
        ) : null}

        {!data && loading ? (
          <div className="flex h-28 items-center justify-center text-xs text-muted-foreground"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Loading secure diagnostics...</div>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-3 lg:grid-cols-3">
              <article className="min-w-0 rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h4 className="text-xs font-bold">OAuth Client ID</h4></div>
                <code className="block break-all rounded-md bg-muted/40 p-2 font-mono text-[11px]">{data.oauthApplication.clientId || "Not configured"}</code>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>Source: {data.oauthApplication.clientIdSource}</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" disabled={!data.oauthApplication.clientId} onClick={() => void copyClientId()}><Copy className="mr-1 h-3 w-3" />Copy</Button>
                </div>
              </article>

              <article className="min-w-0 rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex items-center gap-2"><ServerCog className="h-4 w-4 text-primary" /><h4 className="text-xs font-bold">Client Secret</h4></div>
                <SecretFingerprint value={data.oauthApplication.clientSecret.fingerprint} />
                <p className="mt-2 text-[10px] text-muted-foreground">{data.oauthApplication.clientSecret.configured ? "Configured" : "Missing"} · {data.oauthApplication.clientSecret.source} · {data.oauthApplication.clientSecret.storage}</p>
              </article>

              <article className="min-w-0 rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /><h4 className="text-xs font-bold">OAuth Scope</h4></div>
                <div className="space-y-1">{data.oauthApplication.scope.map((scope) => <code key={scope} className="block break-all rounded-md bg-muted/40 p-2 font-mono text-[10px]">{scope}</code>)}</div>
                <p className="mt-2 text-[10px] text-muted-foreground">Updated: {formatDate(data.oauthApplication.updatedAt)}</p>
              </article>
            </div>

            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h4 className="text-sm font-bold">Per-Drive authorization</h4><p className="text-[11px] text-muted-foreground">Each Drive keeps its own refresh token and independently verified access token.</p></div>
                <span className="text-[10px] text-muted-foreground">Checked {formatDate(data.generatedAt)}</span>
              </div>

              {data.drives.map((drive) => {
                const account = accounts.find((candidate) => candidate.id === drive.storageAccountId);
                const isUploadDestination = writeDestinationId === drive.storageAccountId;

                return (
                <article key={drive.storageAccountId} className={cn("min-w-0 rounded-xl border border-border bg-background p-4", isUploadDestination && "border-primary/35 bg-primary/[0.02]")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><HardDrive className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h5 className="text-sm font-bold">{drive.label}</h5><span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{(account?.status || drive.status).replaceAll("_", " ")}</span></div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{drive.email || "Google email unavailable"}</p>
                        <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">Storage account: {drive.storageAccountId}</p>
                      </div>
                    </div>
                    <StatusPill state={drive.accessToken.state} />
                  </div>

                  {account ? (
                    <div data-testid="drive-account-controls" className="mt-4 grid gap-3 rounded-lg border border-primary/20 bg-card p-3 lg:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1fr)_minmax(210px,1fr)_minmax(250px,1.35fr)]">
                      <div className="min-w-0">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Upload destination</p>
                        {isUploadDestination ? (
                          <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-bold text-primary"><CheckCircle2 className="h-3.5 w-3.5" />Active for uploads</span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => onActivate(account.id)}>Use for uploads</Button>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Storage capacity</p>
                        <StorageCapacity account={account} />
                        <p className="mt-1 text-[10px] text-muted-foreground">{activeFileCountByAccount[account.id] || 0} active file(s) linked here</p>
                      </div>

                      <div className="grid min-w-0 grid-cols-2 gap-2">
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Priority</span>
                          <Input aria-label={account.label + " priority order"} type="number" min={1} className="h-8" value={account.priority_order} onChange={(event) => onUpdate(account.id, { priority_order: Math.max(1, Number(event.target.value) || 1) })} />
                        </label>
                        <label className="grid min-w-0 gap-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Status</span>
                          <select aria-label={account.label + " connection status"} value={account.status} onChange={(event) => onUpdate(account.id, { status: event.target.value as StorageAccount["status"], write_enabled: event.target.value === "connected" })} className="h-8 min-w-0 rounded-md border border-input bg-card px-2 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">
                            <option value="connected">Connected</option>
                            <option value="paused">Standby</option>
                            <option value="reconnect_required">Reconnect required</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </label>
                      </div>

                      <div className="min-w-0">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Account actions</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" disabled={working || !credentialIds.has(account.id)} onClick={() => onRefresh(account.id)}><RefreshCw className="mr-1 h-3.5 w-3.5" />Refresh quota</Button>
                          <Button size="sm" variant="outline" disabled={working} onClick={() => onConnect(account.label, account.id)}><KeyRound className="mr-1 h-3.5 w-3.5" />{credentialIds.has(account.id) ? "Reconnect same account" : "Authorize account"}</Button>
                          <Button size="sm" variant="ghost" onClick={() => onUpdate(account.id, { status: "disabled", write_enabled: false })}>Disable</Button>
                          {account.web_view_link ? <Button size="sm" variant="ghost" aria-label={"Open " + account.label + " in Google Drive"} onClick={() => window.open(account.web_view_link, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-1 h-3.5 w-3.5" />Open Drive</Button> : null}
                        </div>
                        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{accountIsAtSwitchThreshold(account) ? "Threshold reached; new uploads route onward." : "Existing files remain available if another Drive becomes active."}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Canonical credential</p>
                      <p className="mt-1 break-all font-mono text-[11px]">{drive.storageAccountId}</p>
                      <p className="mt-1 break-all text-[10px] text-muted-foreground">Google identity: {drive.googleAccountId || "Unavailable"}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Refresh token</p>
                      <div className="mt-1"><SecretFingerprint value={drive.refreshToken.fingerprint} /></div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{drive.refreshToken.configured ? "Stored" : "Missing"} · {drive.refreshToken.storage}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Access token</p>
                      <div className="mt-1"><SecretFingerprint value={drive.accessToken.fingerprint} missingLabel={drive.accessToken.state === "reconnect_required" ? "Reconnect required" : "Not available"} /></div>
                      <p className="mt-1 text-[10px] text-muted-foreground">Verified: {formatDate(drive.accessToken.verifiedAt)} · server cache ≤ {drive.accessToken.serverCacheWindowMinutes} min</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Root folder</p>
                      <p className="mt-1 text-xs font-semibold">{drive.rootFolderName || "Unavailable"}</p>
                      <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{drive.rootFolderId || "Folder ID unavailable"}</p>
                    </div>
                  </div>

                  {drive.accessToken.error ? <p className="mt-3 rounded-md border border-destructive/20 bg-destructive/[0.05] px-3 py-2 text-[11px] text-destructive">{drive.accessToken.error}</p> : null}

                </article>
                );
              })}

              {!data.drives.length ? <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No Drive slots are configured in this workspace.</div> : null}
            </div>

          </>
        ) : null}
      </div>
    </section>
  );
}
