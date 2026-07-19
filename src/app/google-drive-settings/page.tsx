"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type DriveOAuthConfig = {
  clientId: string;
  hasClientSecret: boolean;
  hasCredentialsKey: boolean;
  configured: boolean;
  redirectUri: string;
  updatedAt: string | null;
};

function randomKey() {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function GoogleDriveSettingsContent() {
  const searchParams = useSearchParams();
  const requestedLabel = searchParams.get("label") || "Urban Drive 1";
  const requestedReturnTo = safeReturnTo(searchParams.get("returnTo"));
  const [config, setConfig] = useState<DriveOAuthConfig | null>(null);
  const [driveLabel, setDriveLabel] = useState(requestedLabel);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [credentialsKey, setCredentialsKey] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const connectUrl = useMemo(() => {
    const params = new URLSearchParams({ label: driveLabel.trim() || "Urban Drive", returnTo: requestedReturnTo });
    return `/api/drive/connect?${params.toString()}`;
  }, [driveLabel, requestedReturnTo]);

  async function loadConfig() {
    setLoading(true);
    setStatus("");
    const response = await fetch("/api/google-drive/oauth/config", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(payload.error || "Could not load Google Drive OAuth settings.");
      setLoading(false);
      return;
    }
    setConfig(payload);
    setClientId(payload.clientId || "");
    setLoading(false);
  }

  useEffect(() => {
    // Inline async load with a cancellation guard so no setState fires
    // synchronously in the effect body (avoids cascading-render warning).
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/google-drive/oauth/config", { cache: "no-store" });
      if (cancelled) return;
      const payload = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) {
        setStatus(payload.error || "Could not load Google Drive OAuth settings.");
        setLoading(false);
        return;
      }
      setConfig(payload);
      setClientId(payload.clientId || "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function save(connectAfterSave = false) {
    const label = driveLabel.trim();
    if (!label) {
      setStatus("Enter a clear Drive label before connecting.");
      return;
    }
    setSaving(true);
    setStatus("Saving Google Drive OAuth credentials securely...");
    const response = await fetch("/api/google-drive/oauth/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, credentialsKey }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(payload.error || "Could not save Google Drive OAuth settings.");
      setSaving(false);
      return;
    }
    setConfig(payload);
    setClientSecret("");
    setCredentialsKey("");
    setStatus(connectAfterSave ? "Credentials saved. Opening Google permission screen..." : "Google Drive OAuth settings saved securely.");
    setSaving(false);
    if (connectAfterSave) window.location.assign(connectUrl);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Owner drive setup</p>
          <h1 className="mt-2 text-2xl font-bold">Add Google Drive with credentials</h1>
          <p className="mt-2 text-sm text-slate-300">
            Save the Google OAuth Client ID, Client Secret, and Drive token encryption key from inside the app. These values are stored server-side in Supabase; the browser does not keep Google tokens.
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">Loading settings...</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm md:grid-cols-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">OAuth status</span>
                <span className={config?.configured ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>{config?.configured ? "Configured" : "Not configured"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Client secret</span>
                <span>{config?.hasClientSecret ? "Saved" : "Missing"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Drive token key</span>
                <span>{config?.hasCredentialsKey ? "Saved" : "Will auto-create"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Last updated</span>
                <span>{config?.updatedAt ? new Date(config.updatedAt).toLocaleString() : "Not saved"}</span>
              </div>
              <div className="space-y-1 md:col-span-2">
                <span className="text-slate-400">Authorized redirect URI for Google Cloud</span>
                <code className="block break-all rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">{config?.redirectUri || "/api/google-drive/oauth/callback"}</code>
                <p className="mt-1 text-xs text-amber-200">Add this exact URI to your Google Cloud Console → Credentials → OAuth 2.0 Client → Authorized redirect URIs.</p>
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-semibold">Drive label</span>
              <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400" value={driveLabel} onChange={(event) => setDriveLabel(event.target.value)} placeholder="Urban Drive 1 / Vendor archive / Active uploads" />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold">Google OAuth Client ID</span>
              <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com" />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold">Google OAuth Client Secret</span>
              <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={config?.hasClientSecret ? "Already saved — enter only to replace" : "Paste client secret"} type="password" />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold">Drive token encryption key</span>
              <div className="flex gap-2">
                <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400" value={credentialsKey} onChange={(event) => setCredentialsKey(event.target.value)} placeholder={config?.hasCredentialsKey ? "Already saved — leave blank unless rotating key" : "Leave blank to auto-create"} type="password" />
                <button type="button" onClick={() => setCredentialsKey(randomKey())} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800">Generate</button>
              </div>
              <p className="text-xs text-amber-200">Do not change this key after Drives are connected unless you intentionally want to reconnect all Drives.</p>
            </label>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">
              <p className="font-semibold text-slate-100">What is saved where</p>
              <p className="mt-2">OAuth Client ID, Client Secret, and encryption key are saved in Supabase server-side config. Google refresh tokens are saved separately in the encrypted Drive vault. Google account password is never stored.</p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button" disabled={saving} onClick={() => save(false)} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60">Save credentials only</button>
              <button type="button" disabled={saving} onClick={() => save(true)} className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-sky-300 disabled:opacity-60">Save & connect Drive</button>
              <a href={connectUrl} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-800">Connect with saved credentials</a>
              <a href={requestedReturnTo} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-800">Back to app</a>
            </div>

            {status ? <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200">{status}</div> : null}
          </div>
        )}
      </section>
    </main>
  );
}

function GoogleDriveSettingsFallback() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">Loading drive setup...</div>
      </section>
    </main>
  );
}

export default function GoogleDriveSettingsPage() {
  return (
    <Suspense fallback={<GoogleDriveSettingsFallback />}>
      <GoogleDriveSettingsContent />
    </Suspense>
  );
}
