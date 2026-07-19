"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Database, KeyRound, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initAuthFetch, setSessionToken } from "@/lib/rdash/client-auth";

const ROLE_OPTIONS = [
  ["FIELD_STAFF", "Field Staff"],
  ["SALES_TELECALLER", "Sales / Telecaller"],
  ["PROCUREMENT_STAFF", "Procurement Staff"],
  ["FINANCE", "Finance"],
  ["OPERATIONS_MANAGER", "Operations Manager"],
  ["ACCOUNTS_ADMIN", "Accounts / Admin"],
] as const;

type Mode = "signin" | "request";

interface ConfigHealth {
  status: string;
  config: {
    sessionSecret: "configured" | "dev-fallback" | "missing";
    supabase: "configured" | "in-memory-fallback";
    workspaceId: string;
    ownerEmail: string;
  };
  warnings: string[];
  dataLayer: "supabase" | "in-memory";
}

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [requestedRole, setRequestedRole] = React.useState("FIELD_STAFF");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [config, setConfig] = React.useState<ConfigHealth | null>(null);

  React.useEffect(() => {
    initAuthFetch();
    // Fetch configuration health to surface any setup issues as actionable UI.
    fetch("/api/health/config")
      .then((r) => r.json())
      .then((data: ConfigHealth) => setConfig(data))
      .catch(() => {
        // Non-fatal — the sign-in form still works without config health.
      });
  }, []);

  async function submitSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; token?: string };
      if (!response.ok) throw new Error(payload.error || "Sign-in failed.");
      if (payload.token) {
        setSessionToken(payload.token);
        initAuthFetch();
      }
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAccessRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, requestedRole }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error || "Access request failed.");
      setSuccess(payload.message || "Access request created. The owner must approve this user before login.");
      setPassword("");
      setMode("signin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Access request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-muted/40 to-primary/5 p-4">
      {/* Decorative background pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
        backgroundSize: "32px 32px",
      }} />
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20">
            <span className="text-2xl font-black tracking-tighter">UC</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Urban Castle</h1>
          <p className="mt-1 text-xs text-muted-foreground">Construction & Contracting Workspace</p>
        </div>

        <div className="rounded-2xl border border-border bg-card/80 p-6 shadow-xl backdrop-blur-sm">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              {mode === "signin" ? <ShieldCheck className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </span>
            <div>
              <h2 className="text-lg font-bold leading-tight">{mode === "signin" ? "Sign in" : "Request access"}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {mode === "signin"
                  ? "Use your approved Supabase Auth account."
                  : "Create a pending account for owner approval."}
              </p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-1 text-sm font-semibold">
            <button type="button" onClick={() => { setMode("signin"); setError(""); }} className={mode === "signin" ? "rounded-md bg-card px-3 py-2 shadow-sm transition-all" : "rounded-md px-3 py-2 text-muted-foreground transition-all hover:text-foreground"}>Sign in</button>
            <button type="button" onClick={() => { setMode("request"); setError(""); }} className={mode === "request" ? "rounded-md bg-card px-3 py-2 shadow-sm transition-all" : "rounded-md px-3 py-2 text-muted-foreground transition-all hover:text-foreground"}>Request access</button>
          </div>

          {mode === "signin" ? (
            <form onSubmit={submitSignIn} className="space-y-4">
              <EmailPasswordFields email={email} password={password} onEmail={setEmail} onPassword={setPassword} passwordAutoComplete="current-password" />
              {error ? (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              ) : null}
              {success ? (
                <div role="status" className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-relaxed">{success}</span>
                </div>
              ) : null}
              <Button type="submit" className="w-full transition-all hover:shadow-md hover:shadow-primary/20" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</Button>

              {/* Demo owner credentials — always visible in dev/preview for easy testing */}
              <button
                type="button"
                onClick={() => { setEmail("akarshsingh4@gmail.com"); setPassword("Akarsh@123."); setError(""); }}
                className="group flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-3 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/[0.06]"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">Use <span className="font-semibold text-foreground">demo owner</span> credentials</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            </form>
          ) : (
            <form onSubmit={submitAccessRequest} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Full name</Label>
                <Input id="displayName" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              </div>
              <EmailPasswordFields email={email} password={password} onEmail={setEmail} onPassword={setPassword} passwordAutoComplete="new-password" />
              <div className="space-y-1.5">
                <Label htmlFor="requestedRole">Requested role</Label>
                <select id="requestedRole" value={requestedRole} onChange={(event) => setRequestedRole(event.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm">
                  {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              {error ? (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              ) : null}
              <Button type="submit" className="w-full transition-all hover:shadow-md hover:shadow-primary/20" disabled={busy}>{busy ? "Creating request..." : "Create access request"}</Button>
            </form>
          )}

          <div className="mt-5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Owner approval required
            </p>
            <p className="mt-1 leading-relaxed">Only active users in <span className="font-mono text-foreground/80">rdash_user_roles</span> can enter the app. Pending users stay blocked until the Owner approves them.</p>
          </div>

          {/* Configuration health panel — surfaces session/Supabase config status */}
          {config ? (
            <div className="mt-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-[11px]">
              <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Configuration health
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <ConfigRow
                  icon={<KeyRound className="h-3 w-3" />}
                  label="Session"
                  value={config.config.sessionSecret}
                  status={config.config.sessionSecret === "configured" ? "ok" : config.config.sessionSecret === "dev-fallback" ? "warn" : "bad"}
                />
                <ConfigRow
                  icon={<Database className="h-3 w-3" />}
                  label="Database"
                  value={config.config.supabase === "configured" ? "Supabase" : "In-memory"}
                  status={config.config.supabase === "configured" ? "ok" : "warn"}
                />
              </div>
              {config.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {config.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="leading-relaxed">{w}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Next.js 16 · Supabase · Vercel
        </p>
      </div>
    </main>
  );
}

function ConfigRow({ icon, label, value, status }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: "ok" | "warn" | "bad";
}) {
  const color = status === "ok" ? "text-success" : status === "warn" ? "text-amber-600 dark:text-amber-400" : "text-destructive";
  return (
    <div className="flex items-center gap-1.5">
      <span className={color}>{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

function EmailPasswordFields({ email, password, onEmail, onPassword, passwordAutoComplete }: {
  email: string;
  password: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  passwordAutoComplete: string;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => onEmail(event.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete={passwordAutoComplete} value={password} onChange={(event) => onPassword(event.target.value)} required />
      </div>
    </>
  );
}
