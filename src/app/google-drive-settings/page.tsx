"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type DriveOAuthConfig = {
  clientId: string;
  hasClientSecret: boolean;
  hasCredentialsKey: boolean;
  configured: boolean;
  configurationSource?: "environment";
  redirectUri: string;
  updatedAt: string | null;
};

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function GoogleDriveSettingsContent() {
  const searchParams = useSearchParams();
  const requestedLabel = searchParams.get("label") || "Urban Drive 1";
  const requestedReturnTo = safeReturnTo(searchParams.get("returnTo"));
  const driveError = searchParams.get("drive_error") || "";
  const [config, setConfig] = useState<DriveOAuthConfig | null>(null);
  const [driveLabel, setDriveLabel] = useState(requestedLabel);
  const [status, setStatus] = useState(driveError);
  const [loading, setLoading] = useState(true);
  const connectUrl = useMemo(() => {
    const params = new URLSearchParams({ label: driveLabel.trim() || "Urban Drive", returnTo: requestedReturnTo });
    return `/api/drive/connect?${params.toString()}`;
  }, [driveLabel, requestedReturnTo]);

  useEffect(() => {
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
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Owner drive setup</p>
          <h1 className="mt-2 text-2xl font-bold">Connect Google Drive safely</h1>
          <p className="mt-2 text-sm text-slate-300">
            OAuth secrets are no longer accepted from the browser. Configure the app-level Google credentials in Vercel environment variables, then connect individual Drive accounts here.
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
                <span className="text-slate-400">Client ID</span>
                <span>{config?.clientId ? "Set in Vercel env" : "Missing"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Client secret</span>
                <span>{config?.hasClientSecret ? "Set in Vercel env" : "Missing"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Drive token key</span>
                <span>{config?.hasCredentialsKey ? "Set in Vercel env" : "Missing"}</span>
              </div>
              <div className="space-y-1 md:col-span-2">
                <span className="text-slate-400">Authorized redirect URI for Google Cloud</span>
                <code className="block break-all rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">{config?.redirectUri || "/api/google-drive/oauth/callback"}</code>
                <p className="mt-1 text-xs text-amber-200">Add this exact URI to Google Cloud Console → Credentials → OAuth 2.0 Client → Authorized redirect URIs.</p>
              </div>
            </div>

            {!config?.configured ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p className="font-bold">Required Vercel environment variables</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
                  <li>GOOGLE_DRIVE_OAUTH_CLIENT_ID</li>
                  <li>GOOGLE_DRIVE_OAUTH_CLIENT_SECRET</li>
                  <li>DRIVE_TOKEN_ENCRYPTION_KEY</li>
                </ul>
                <p className="mt-3 text-xs text-amber-100/80">After saving these in Vercel, redeploy the project. Do not paste client secrets or token keys into Urban Castle screens.</p>
              </div>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm font-semibold">Drive label</span>
              <input className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400" value={driveLabel} onChange={(event) => setDriveLabel(event.target.value)} placeholder="Urban Drive 1 / Vendor archive / Active uploads" />
            </label>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">
              <p className="font-semibold text-slate-100">What is stored where</p>
              <p className="mt-2">The OAuth client secret and token encryption key stay in Vercel environment variables. Google refresh tokens are written only to the server vault after encryption. The browser receives only the Google consent redirect and temporary Drive upload session URLs.</p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <a aria-disabled={!config?.configured} href={config?.configured ? connectUrl : undefined} className={config?.configured ? "rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400" : "pointer-events-none rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-slate-400"}>Connect Drive</a>
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
