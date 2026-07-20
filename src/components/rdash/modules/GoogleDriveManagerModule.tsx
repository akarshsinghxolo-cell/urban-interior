"use client";
import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/rdash/format";
import {
  HardDrive,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  FolderCog,
  Trash2,
  Eye,
  EyeOff,
  Save,
  ArrowRight,
  Cloud,
  Lock,
  Copy,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type OAuthConfig = {
  clientId: string;
  hasClientSecret: boolean;
  hasCredentialsKey: boolean;
  configured: boolean;
  redirectUri: string;
  updatedAt: string | null;
};

type Tab = "overview" | "connect" | "oauth" | "guide";

export function GoogleDriveManagerModule() {
  const db = useRDashStore((s) => s.db);
  const role = useRDashStore((s) => s.authUser?.role || "Unauthenticated");
  const isOwner = role === "Owner";
  const [tab, setTab] = React.useState<Tab>("overview");
  const [config, setConfig] = React.useState<OAuthConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  // OAuth config form state
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [credentialsKey, setCredentialsKey] = React.useState("");
  const [showSecret, setShowSecret] = React.useState(false);
  const [showCredsKey, setShowCredsKey] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Connect form state
  const [driveLabel, setDriveLabel] = React.useState("");

  const accounts = db.master.storageAccounts || [];

  // Load OAuth config on mount
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/google-drive/oauth/config", { cache: "no-store" });
        const payload = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (resp.ok) {
          setConfig(payload);
          setClientId(payload.clientId || "");
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveConfig = async (connectAfter = false) => {
    if (!clientId.trim()) return toast.error("Client ID is required.");
    if (!clientSecret.trim() && !config?.hasClientSecret) return toast.error("Client Secret is required.");
    setSaving(true);
    try {
      const body: Record<string, string> = { clientId: clientId.trim() };
      if (clientSecret.trim()) body.clientSecret = clientSecret.trim();
      if (credentialsKey.trim()) body.credentialsKey = credentialsKey.trim();
      const resp = await fetch("/api/google-drive/oauth/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload.error || "Could not save OAuth config.");
      setConfig(payload);
      setClientSecret("");
      setCredentialsKey("");
      toast.success("Google Drive OAuth credentials saved to database.");
      if (connectAfter) {
        toast.info("Opening Google permission screen…");
        setTimeout(() => startConnect(), 1000);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const startConnect = () => {
    const label = driveLabel.trim() || `Urban Drive ${accounts.length + 1}`;
    const params = new URLSearchParams({ label, returnTo: "/" });
    window.location.assign(`/api/drive/connect?${params.toString()}`);
  };

  const refreshAccount = async (accountId: string) => {
    try {
      const resp = await fetch("/api/google-drive/refresh-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(payload.error || "Refresh failed.");
      toast.success("Drive quota refreshed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed.");
    }
  };

  const copyRedirectUri = () => {
    if (!config?.redirectUri) return;
    navigator.clipboard.writeText(config.redirectUri);
    toast.success("Redirect URI copied to clipboard.");
  };

  const tabs: Array<[Tab, string, React.ComponentType<{ className?: string }>]> = [
    ["overview", "Overview", HardDrive],
    ["connect", "Connect Drive", Plus],
    ["oauth", "OAuth Settings", KeyRound],
    ["guide", "Setup Guide", HelpCircle],
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cloud className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Google Drive Manager</h2>
            <p className="text-xs text-muted-foreground">
              Connect Google Drive accounts via OAuth. Tokens are encrypted and stored in the database — drives stay connected across sessions.
            </p>
          </div>
        </div>
        {config?.configured ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> OAuth Configured
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-bold text-warning">
            <AlertTriangle className="h-3.5 w-3.5" /> OAuth Not Configured
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1.5 shadow-sm">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Connected Drives" value={accounts.length} icon={<HardDrive className="h-4 w-4" />} tone="primary" />
            <SummaryCard label="Active" value={accounts.filter((a) => a.status === "connected").length} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
            <SummaryCard label="Total Quota" value={formatBytes(accounts.reduce((s, a) => s + (a.quota_limit_bytes || 0), 0))} icon={<Cloud className="h-4 w-4" />} tone="default" />
            <SummaryCard label="Used" value={formatBytes(accounts.reduce((s, a) => s + (a.quota_used_bytes || 0), 0))} icon={<FolderCog className="h-4 w-4" />} tone="warning" />
          </div>

          {/* Connected drives list */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-3">
              <h3 className="text-sm font-bold">Connected Google Drive Accounts</h3>
              <p className="text-xs text-muted-foreground">Tokens are encrypted with AES-256-GCM and stored in Supabase. Drives remain connected until you disconnect them.</p>
            </div>
            {accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Cloud className="h-12 w-12 text-muted-foreground/30" />
                <p className="mt-2 text-sm font-semibold text-muted-foreground">No Google Drive accounts connected</p>
                <p className="text-xs text-muted-foreground/70">Go to the "Connect Drive" tab to add your first Google Drive.</p>
                {isOwner && (
                  <Button size="sm" className="mt-4" onClick={() => setTab("connect")}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Connect a Drive
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {accounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-4 px-4 py-3">
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", account.status === "connected" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                      <HardDrive className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold">{account.label}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold", account.status === "connected" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                          {account.status}
                        </span>
                        {account.write_enabled && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">Write</span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {account.email || "No email"} · Priority {account.priority_order}
                      </p>
                      {/* Quota bar */}
                      {(account.quota_limit_bytes || 0) > 0 && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full", quotaPct(account) > 85 ? "bg-destructive" : quotaPct(account) > 60 ? "bg-warning" : "bg-success")}
                              style={{ width: `${Math.min(100, quotaPct(account))}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10px] font-mono text-muted-foreground">
                            {formatBytes(account.quota_used_bytes || 0)} / {formatBytes(account.quota_limit_bytes || 0)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {account.web_view_link && (
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => window.open(account.web_view_link, "_blank")} title="Open Drive folder">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isOwner && (
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => refreshAccount(account.id)} title="Refresh quota">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "connect" && (
        <div className="space-y-4">
          {!config?.configured ? (
            <div className="rounded-xl border border-warning/40 bg-warning/[0.08] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-warning">OAuth not configured yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Before connecting a Google Drive, you need to set up Google OAuth credentials. Go to the <b>OAuth Settings</b> tab and save your Client ID + Client Secret.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setTab("oauth")}>
                    <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Go to OAuth Settings
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-bold">Connect a new Google Drive account</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Enter a label for this Drive account (e.g. "Main Drive", "Backup Drive"). You'll be redirected to Google's permission screen. After you approve, the refresh token will be encrypted and stored in the database — the Drive stays connected until you disconnect it.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid w-full max-w-sm gap-1.5">
                  <Label className="text-xs font-medium">Drive label</Label>
                  <Input
                    value={driveLabel}
                    onChange={(e) => setDriveLabel(e.target.value)}
                    placeholder={`Urban Drive ${accounts.length + 1}`}
                    className="h-9"
                  />
                </div>
                <Button onClick={startConnect} disabled={!isOwner}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Connect Google Drive
                </Button>
              </div>
              {!isOwner && (
                <p className="mt-2 text-xs text-destructive">Only the Owner can connect Google Drive accounts.</p>
              )}
            </div>
          )}

          {/* How it works */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <h3 className="mb-2 text-sm font-bold">How Google Drive connection works</h3>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">1</span>
                <span>Owner saves Google OAuth Client ID + Client Secret in the <b>OAuth Settings</b> tab (stored encrypted in Supabase).</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">2</span>
                <span>Owner clicks "Connect Google Drive" → redirected to Google's consent screen.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">3</span>
                <span>Google returns a <b>refresh token</b> → encrypted with AES-256-GCM → stored in Supabase <code className="rounded bg-muted px-1">GenericRecord</code> table.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">4</span>
                <span>A <code className="rounded bg-muted px-1">StorageAccount</code> is created in the workspace → Drive stays connected across all sessions and server restarts.</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">5</span>
                <span>The app uses the refresh token to get fresh access tokens (1-hour validity) on demand — no repeated logins needed.</span>
              </li>
            </ol>
          </div>
        </div>
      )}

      {tab === "oauth" && (
        <div className="space-y-4">
          {!isOwner ? (
            <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
              <Lock className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-semibold text-muted-foreground">Owner access required</p>
              <p className="text-xs text-muted-foreground/70">Only the Owner can view and edit Google OAuth credentials.</p>
            </div>
          ) : (
            <>
              {/* Redirect URI */}
              {config?.redirectUri && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold">Authorized Redirect URI</h3>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Copy this exact URI and add it to your Google Cloud Console → Credentials → OAuth 2.0 Client → Authorized redirect URIs.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">{config.redirectUri}</code>
                    <Button size="sm" variant="outline" onClick={copyRedirectUri}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                </div>
              )}

              {/* OAuth credentials form */}
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold">Google OAuth Credentials</h3>
                    <p className="text-xs text-muted-foreground">
                      {config?.hasClientSecret
                        ? "Client Secret is set. Enter a new value only to replace it."
                        : "Enter your Google OAuth Client ID and Client Secret."}
                    </p>
                  </div>
                  {config?.updatedAt && (
                    <span className="text-[10px] text-muted-foreground">Updated {new Date(config.updatedAt).toLocaleDateString("en-IN")}</span>
                  )}
                </div>

                <div className="space-y-4">
                  {/* Client ID */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium">Client ID</Label>
                    <Input
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="123456789-abcdef.apps.googleusercontent.com"
                      className="h-9 font-mono text-xs"
                    />
                  </div>

                  {/* Client Secret */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium">
                      Client Secret {config?.hasClientSecret && <span className="text-success">(configured)</span>}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showSecret ? "text" : "password"}
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder={config?.hasClientSecret ? "•••••••••••••••• (enter new to replace)" : "GOCSPX-xxxxxxxxxxxxxxxx"}
                        className="h-9 pr-10 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Credentials Key (encryption key) */}
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-medium">
                      Encryption Key {config?.hasCredentialsKey && <span className="text-success">(configured)</span>}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showCredsKey ? "text" : "password"}
                        value={credentialsKey}
                        onChange={(e) => setCredentialsKey(e.target.value)}
                        placeholder={config?.hasCredentialsKey ? "•••••• (enter new to rotate)" : "32+ character random string (auto-generated if blank)"}
                        className="h-9 pr-10 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCredsKey(!showCredsKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showCredsKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Used to encrypt Drive refresh tokens (AES-256-GCM). Leave blank to auto-generate or keep existing.
                    </p>
                  </div>

                  {/* Save buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => saveConfig(false)} disabled={saving}>
                      <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Credentials"}
                    </Button>
                    <Button variant="outline" onClick={() => saveConfig(true)} disabled={saving}>
                      <ArrowRight className="mr-1.5 h-3.5 w-3.5" /> Save & Connect Drive
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "guide" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold">Step-by-step: Add Google Drive to Urban Castle</h3>

            <div className="space-y-5">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">1</div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold">Create a Google Cloud Project</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-primary underline">Google Cloud Console</a> → create a new project (or select existing).
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">2</div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold">Enable Google Drive API</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    In the Cloud Console → <b>APIs & Services → Library</b> → search "Google Drive API" → click <b>Enable</b>.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">3</div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold">Configure OAuth Consent Screen</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Go to <b>APIs & Services → OAuth consent screen</b>:
                  </p>
                  <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground">
                    <li>User type: <b>External</b> (or Internal if you have Google Workspace)</li>
                    <li>Fill in app name (e.g. "Urban Castle"), support email, developer email</li>
                    <li>Add scope: <code className="rounded bg-muted px-1">https://www.googleapis.com/auth/drive</code></li>
                    <li>Add your email as a Test User (if in Testing mode)</li>
                  </ul>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">4</div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold">Create OAuth 2.0 Client ID</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Go to <b>APIs & Services → Credentials → Create Credentials → OAuth client ID</b>:
                  </p>
                  <ul className="mt-1 ml-4 list-disc text-xs text-muted-foreground">
                    <li>Application type: <b>Web application</b></li>
                    <li>Name: "Urban Castle Drive"</li>
                    <li>Authorized redirect URIs: add the URI from the <b>OAuth Settings</b> tab (click Copy)</li>
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">
                    After creating, copy the <b>Client ID</b> and <b>Client Secret</b>.
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">5</div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold">Save credentials in Urban Castle</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Go to the <button onClick={() => setTab("oauth")} className="text-primary underline">OAuth Settings</button> tab → paste Client ID + Client Secret → click <b>Save Credentials</b>. These are stored encrypted in Supabase.
                  </p>
                </div>
              </div>

              {/* Step 6 */}
              <div className="flex gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">6</div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold">Connect your Google Drive</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Go to the <button onClick={() => setTab("connect")} className="text-primary underline">Connect Drive</button> tab → enter a label → click <b>Connect Google Drive</b>. You'll be redirected to Google → approve → the refresh token is encrypted and stored in the database. The Drive stays connected permanently until you disconnect it.
                  </p>
                </div>
              </div>
            </div>

            {/* Security note */}
            <div className="mt-5 rounded-lg border border-success/30 bg-success/[0.06] p-3">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div>
                  <p className="text-xs font-bold text-success">Security: How tokens are stored</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Google Drive refresh tokens are encrypted with <b>AES-256-GCM</b> using the Encryption Key, then stored in the Supabase <code className="rounded bg-muted px-1">GenericRecord</code> table as ciphertext. The browser never sees the refresh token. Access tokens (1-hour validity) are generated on-demand server-side using the refresh token. Even if the database is compromised, the tokens cannot be decrypted without the Encryption Key (stored separately in env vars or the OAuth config record).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: "primary" | "success" | "warning" | "default" }) {
  const toneClass = {
    primary: "border-primary/20 bg-primary/[0.04]",
    success: "border-success/20 bg-success/[0.04]",
    warning: "border-warning/20 bg-warning/[0.04]",
    default: "border-border bg-card",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function quotaPct(account: { quota_used_bytes?: number; quota_limit_bytes?: number }): number {
  const limit = account.quota_limit_bytes || 0;
  if (limit === 0) return 0;
  return Math.round(((account.quota_used_bytes || 0) / limit) * 100);
}
