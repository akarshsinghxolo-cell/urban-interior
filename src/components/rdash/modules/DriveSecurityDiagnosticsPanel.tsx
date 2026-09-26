"use client";

import * as React from "react";
import { formatBytes } from "@/lib/rdash/format";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Fingerprint,
  HardDrive,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRDashStore } from "@/lib/rdash/store";
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

type ResumableSessionDiagnostics = {
  uploadItemId: string;
  uploadBatchId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  confirmedBytes: number;
  progress: number;
  status: string;
  retryCount: number;
  sessionFingerprint: string | null;
  sessionHost: string | null;
  sessionExpiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  resumableSessions: ResumableSessionDiagnostics[];
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

export function DriveSecurityDiagnosticsPanel() {
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
            <h3 className="break-words text-sm font-bold">Drive Credentials &amp; Sessions</h3>
            <p className="mt-0.5 max-w-4xl text-[11px] leading-4 text-muted-foreground">
              Owner-only security diagnostics for the OAuth application, every connected Drive, token health and active resumable uploads.
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
              Client Secret, OAuth access tokens, Google refresh tokens and complete resumable-session URIs are not returned to the browser. Stable SHA-256 fingerprints let you identify and compare each value without granting access to anyone viewing the page.
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
                <div><h4 className="text-sm font-bold">Per-Drive authorization and upload sessions</h4><p className="text-[11px] text-muted-foreground">Each Drive keeps its own refresh token, independently verified access token and resumable sessions.</p></div>
                <span className="text-[10px] text-muted-foreground">Checked {formatDate(data.generatedAt)}</span>
              </div>

              {data.drives.map((drive) => (
                <article key={drive.storageAccountId} className="min-w-0 rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><HardDrive className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h5 className="text-sm font-bold">{drive.label}</h5><span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{drive.status.replaceAll("_", " ")}</span></div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{drive.email || "Google email unavailable"}</p>
                        <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">Storage account: {drive.storageAccountId}</p>
                      </div>
                    </div>
                    <StatusPill state={drive.accessToken.state} />
                  </div>

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

                  <div className="mt-4 min-w-0 overflow-hidden rounded-lg border border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2"><div className="flex min-w-0 items-center gap-2"><UploadCloud className="h-3.5 w-3.5 shrink-0 text-primary" /><p className="text-xs font-bold">Resumable sessions</p></div><span className="text-[10px] text-muted-foreground">{drive.resumableSessions.length} session{drive.resumableSessions.length === 1 ? "" : "s"}</span></div>
                    {drive.resumableSessions.length ? (
                      <>
                        <div className="divide-y divide-border md:hidden" data-testid="resumable-sessions-mobile">
                          {drive.resumableSessions.map((session) => (
                            <div key={session.uploadItemId} className="grid min-w-0 gap-2 px-3 py-3 text-[11px]">
                              <div className="min-w-0">
                                <p className="break-words font-semibold">{session.fileName}</p>
                                <p className="mt-0.5 break-all font-mono text-[9px] text-muted-foreground">{session.uploadItemId}</p>
                              </div>
                              <div className="min-w-0">
                                <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Session fingerprint</p>
                                <SecretFingerprint value={session.sessionFingerprint} />
                                <p className="mt-1 break-all text-[9px] text-muted-foreground">{session.sessionHost || "Google upload endpoint"}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="min-w-0">
                                  <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Status</p>
                                  <span className="mt-1 inline-flex max-w-full rounded-full border border-border bg-muted px-2 py-0.5 text-[9px] font-bold uppercase">{session.status.replaceAll("_", " ")}</span>
                                  <p className="mt-1 text-[9px] text-muted-foreground">Retries: {session.retryCount}</p>
                                </div>
                                <div className="min-w-0 text-right">
                                  <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Progress</p>
                                  <p className="mt-1 font-semibold">{Math.max(0, Math.min(100, Math.round(session.progress)))}%</p>
                                  <p className="break-words text-[9px] text-muted-foreground">{formatBytes(session.confirmedBytes)} / {formatBytes(session.sizeBytes)}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-1 border-t border-border/70 pt-2 text-[9px] text-muted-foreground sm:grid-cols-2">
                                <span className="flex min-w-0 items-start gap-1"><Clock3 className="mt-0.5 h-3 w-3 shrink-0" /><span className="break-words">Expires {formatDate(session.sessionExpiresAt)}</span></span>
                                <span className="break-words sm:text-right">Updated {formatDate(session.updatedAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block" data-testid="resumable-sessions-table">
                          <table className="w-full min-w-[900px] text-left text-[11px]">
                            <thead className="bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">File</th><th className="px-3 py-2">Session fingerprint</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Progress</th><th className="px-3 py-2">Expires</th><th className="px-3 py-2">Updated</th></tr></thead>
                            <tbody className="divide-y divide-border">
                              {drive.resumableSessions.map((session) => (
                                <tr key={session.uploadItemId}>
                                  <td className="px-3 py-2"><p className="max-w-[240px] truncate font-semibold">{session.fileName}</p><p className="font-mono text-[9px] text-muted-foreground">{session.uploadItemId}</p></td>
                                  <td className="px-3 py-2"><SecretFingerprint value={session.sessionFingerprint} /><p className="mt-1 text-[9px] text-muted-foreground">{session.sessionHost || "Google upload endpoint"}</p></td>
                                  <td className="px-3 py-2"><span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[9px] font-bold uppercase">{session.status.replaceAll("_", " ")}</span><p className="mt-1 text-[9px] text-muted-foreground">Retries: {session.retryCount}</p></td>
                                  <td className="px-3 py-2"><p className="font-semibold">{Math.max(0, Math.min(100, Math.round(session.progress)))}%</p><p className="text-[9px] text-muted-foreground">{formatBytes(session.confirmedBytes)} / {formatBytes(session.sizeBytes)}</p></td>
                                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3 text-muted-foreground" />{formatDate(session.sessionExpiresAt)}</span></td>
                                  <td className="px-3 py-2">{formatDate(session.updatedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p className="px-3 py-5 text-center text-[11px] text-muted-foreground">No resumable upload session currently holds a server-side URI for this Drive.</p>
                    )}
                  </div>
                </article>
              ))}

              {!data.drives.length ? <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No Drive slots are configured in this workspace.</div> : null}
            </div>

          </>
        ) : null}
      </div>
    </section>
  );
}
