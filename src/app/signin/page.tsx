"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Database,
  HardHat,
  KeyRound,
  Layers,
  type LucideIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
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

/* ─────────────────────────────────────────────────────────────────────── */
/*  Left hero panel content                                                */
/* ─────────────────────────────────────────────────────────────────────── */

const HERO_STATS: Array<{ label: string; value: string; icon: LucideIcon }> = [
  { label: "Modules", value: "52", icon: Layers },
  { label: "Collections", value: "56", icon: Database },
  { label: "FK rules", value: "178", icon: ShieldCheck },
];

const HERO_FEATURES: Array<{ title: string; description: string; icon: LucideIcon }> = [
  {
    title: "CRM & Sales Pipeline",
    description: "Leads → quotations → accepted scopes → work orders, with drag-and-drop kanban.",
    icon: TrendingUp,
  },
  {
    title: "Site Execution & Field",
    description: "Drawings, BOQ, contractor bidding, GPS visit proofs, attendance payroll.",
    icon: HardHat,
  },
  {
    title: "Procurement & Finance",
    description: "Vendor RFQs, POs, GRNs, vendor bills, job PnL, site profitability.",
    icon: Wrench,
  },
  {
    title: "Data Integrity Engine",
    description: "178 referential rules, cascade-delete, auto-repair, 100/100 health score.",
    icon: ShieldCheck,
  },
];

const CHANGELOG: Array<{ version: string; date: string; title: string; tag: "feature" | "fix" | "polish" }> = [
  { version: "0.3.0", date: "Jul 2026", title: "Workspace Health ribbon + /api/health/summary endpoint", tag: "feature" },
  { version: "0.2.9", date: "Jul 2026", title: "Signin dev-fallback secret + config health panel", tag: "fix" },
  { version: "0.2.8", date: "Jul 2026", title: "Data Integrity module (cascade-delete, repair, 178 FK rules)", tag: "feature" },
  { version: "0.2.7", date: "Jul 2026", title: "Premium WorkspacePulseStrip with animated KPI tiles", tag: "polish" },
];

const TAG_STYLES: Record<CHANGELOG[number]["tag"], string> = {
  feature: "bg-primary/10 text-primary ring-1 ring-primary/20",
  fix: "bg-success/10 text-success ring-1 ring-success/20",
  polish: "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400",
};

/* ─────────────────────────────────────────────────────────────────────── */
/*  Page                                                                    */
/* ─────────────────────────────────────────────────────────────────────── */

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
  const [activeFeature, setActiveFeature] = React.useState(0);

  React.useEffect(() => {
    initAuthFetch();
    fetch("/api/health/config")
      .then((r) => r.json())
      .then((data: ConfigHealth) => setConfig(data))
      .catch(() => {
        // Non-fatal — the sign-in form still works without config health.
      });
    // Rotate the highlighted feature on the hero every 3.5s for a "living" feel.
    const id = setInterval(() => {
      setActiveFeature((i) => (i + 1) % HERO_FEATURES.length);
    }, 3500);
    return () => clearInterval(id);
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
    <main className="relative flex min-h-screen items-stretch overflow-hidden bg-background">
      {/* ───────── LEFT: branded hero panel (hidden on small screens) ───────── */}
      <aside
        aria-hidden
        className="relative hidden w-[46%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/85 p-10 text-primary-foreground lg:flex xl:w-[48%]"
      >
        {/* Animated decorative blobs */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-white/[0.06] blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 top-1/4 h-40 w-40 rounded-full bg-amber-300/10 blur-2xl" />
        {/* Subtle grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Brand header */}
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <span className="text-xl font-black tracking-tighter">UC</span>
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">Urban Castle</p>
              <p className="text-xs text-primary-foreground/70">Construction & Contracting Workspace</p>
            </div>
          </div>
        </div>

        {/* Headline + rotating feature */}
        <div className="relative">
          <h1 className="max-w-md text-3xl font-black leading-tight tracking-tight xl:text-4xl">
            One workspace for the entire&nbsp;build.
          </h1>
          <p className="mt-3 max-w-md text-sm text-primary-foreground/75">
            CRM, site execution, procurement, finance, field ops and integrity — unified into a single
            operating drive, with referential integrity enforced across 178 rules.
          </p>

          {/* Rotating feature highlight */}
          <div className="mt-6 max-w-md rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {HERO_FEATURES.map((f, i) => {
                const Icon = f.icon;
                const active = i === activeFeature;
                return (
                  <button
                    key={f.title}
                    type="button"
                    onClick={() => setActiveFeature(i)}
                    aria-label={f.title}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                      active
                        ? "bg-white text-primary shadow-lg scale-105"
                        : "bg-white/10 text-primary-foreground/60 hover:bg-white/20"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 min-h-[60px]">
              <p className="text-sm font-bold">{HERO_FEATURES[activeFeature].title}</p>
              <p className="mt-1 text-xs text-primary-foreground/75">
                {HERO_FEATURES[activeFeature].description}
              </p>
            </div>
            {/* Progress dots */}
            <div className="mt-3 flex gap-1.5">
              {HERO_FEATURES.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === activeFeature ? "w-6 bg-white" : "w-1.5 bg-white/30"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative flex items-center gap-8">
          {HERO_STATS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="rd-tabular text-xl font-black leading-none">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wider text-primary-foreground/60">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ───────── RIGHT: auth + meta ───────── */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto bg-gradient-to-br from-background via-muted/30 to-primary/[0.04] p-5 sm:p-8">
        {/* Decorative background for the right side */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-primary/[0.04] blur-3xl" />

        <div className="relative flex w-full max-w-md flex-col">
          {/* Mobile brand header (visible only when hero is hidden) */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">Urban Castle</p>
              <p className="text-[11px] text-muted-foreground">Construction & Contracting Workspace</p>
            </div>
          </div>

          {/* Auth card */}
          <div className="rounded-2xl border border-border bg-card/90 p-6 shadow-xl backdrop-blur-sm">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                {mode === "signin" ? <ShieldCheck className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
              </span>
              <div>
                <h2 className="text-lg font-bold leading-tight">
                  {mode === "signin" ? "Sign in" : "Request access"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {mode === "signin"
                    ? "Use your approved Supabase Auth account."
                    : "Create a pending account for owner approval."}
                </p>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(""); }}
                className={mode === "signin" ? "rounded-md bg-card px-3 py-2 shadow-sm transition-all" : "rounded-md px-3 py-2 text-muted-foreground transition-all hover:text-foreground"}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => { setMode("request"); setError(""); }}
                className={mode === "request" ? "rounded-md bg-card px-3 py-2 shadow-sm transition-all" : "rounded-md px-3 py-2 text-muted-foreground transition-all hover:text-foreground"}
              >
                Request access
              </button>
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
                <Button type="submit" className="w-full transition-all hover:shadow-md hover:shadow-primary/20" disabled={busy}>
                  {busy ? "Signing in..." : "Sign in"}
                </Button>

                {/* Demo owner credentials — always visible in dev/preview */}
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
                <Button type="submit" className="w-full transition-all hover:shadow-md hover:shadow-primary/20" disabled={busy}>
                  {busy ? "Creating request..." : "Create access request"}
                </Button>
              </form>
            )}

            {/* Owner-approval note */}
            <div className="mt-5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Owner approval required
              </p>
              <p className="mt-1 leading-relaxed">Only active users in <span className="font-mono text-foreground/80">rdash_user_roles</span> can enter the app. Pending users stay blocked until the Owner approves them.</p>
            </div>

            {/* Configuration health panel */}
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

          {/* What's new / changelog panel */}
          <div className="mt-4 rounded-2xl border border-border bg-card/70 p-4 shadow-sm backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground">
                <Zap className="h-3.5 w-3.5 text-primary" />
                What's new
              </p>
              <span className="text-[10px] text-muted-foreground">v0.3.0</span>
            </div>
            <ul className="space-y-2.5">
              {CHANGELOG.map((c) => (
                <li key={c.version + c.title} className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${TAG_STYLES[c.tag]}`}
                  >
                    {c.tag}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-foreground/90">{c.title}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      v{c.version} · {c.date}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Trust footer */}
          <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> Owner-approved
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> 178 FK rules
            </span>
            <span className="text-muted-foreground/30">·</span>
            <a
              href="https://nextjs.org"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
            >
              Next.js 16 <ArrowUpRight className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                          */
/* ─────────────────────────────────────────────────────────────────────── */

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
