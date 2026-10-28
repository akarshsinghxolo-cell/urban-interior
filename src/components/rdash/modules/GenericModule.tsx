"use client";

import { Building2, CheckCircle2, Database, Download, FileText, HeartPulse, History, Moon, Sun, Upload, Users } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useRDashStore } from "@/lib/rdash/store";
import type { DataSource, FilterPreset } from "@/lib/rdash/modules";
import { MetricCard } from "../primitives";
import { ProfileNameEditor } from "../ProfileNameEditor";

/**
 * The route registry sends only `systemSettings` here. Keep this page focused
 * on safe preferences and valid destinations; operational administration
 * remains in its dedicated modules.
 */
export function GenericModule({ renderer }: {
    renderer: "system";
    dataSource?: DataSource;
    filter?: Record<string, string>;
    filterPresets?: FilterPreset[];
    moduleId: string;
    label: string;
    description?: string;
}) {
    const db = useRDashStore((state) => state.db);
    const setActiveModule = useRDashStore((state) => state.setActiveModule);
    const role = useRDashStore((state) => state.authUser?.role || "Unauthenticated");
    const { theme, setTheme } = useTheme();
    if (renderer !== "system") return null;

    const isDark = theme === "dark";
    return (
        <div className="flex flex-col gap-5">
            <div>
                <h2 className="text-lg font-bold tracking-tight">Settings</h2>
                <p className="text-xs text-muted-foreground">Workspace preferences and safe data tools</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard label="Customers" value={db.customers.length} tone="primary" icon={<Users className="h-4 w-4" />} />
                <MetricCard label="Quotations" value={db.quotations.length} tone="warning" icon={<FileText className="h-4 w-4" />} />
                <MetricCard label="Work Orders" value={db.workOrders.length} tone="success" icon={<Building2 className="h-4 w-4" />} />
                <MetricCard label="Tasks" value={db.tasks.length} tone="default" icon={<CheckCircle2 className="h-4 w-4" />} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
                    <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        </span>
                        <h3 className="text-sm font-semibold">Appearance</h3>
                    </div>
                    <p className="mb-3 text-xs text-muted-foreground">Switch between light and dark themes.</p>
                    <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setTheme(isDark ? "light" : "dark")}>
                        {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                        {isDark ? "Light mode" : "Dark mode"}
                    </Button>
                </section>

                <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
                    <div className="mb-3 flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Users className="h-4 w-4" /></span>
                        <h3 className="text-sm font-semibold">Signed-in access</h3>
                    </div>
                    <p className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">Signed in as <ProfileNameEditor /></p>
                    <p className="text-xs text-muted-foreground">Server-assigned role: <span className="font-semibold text-foreground">{role}</span></p>
                    <p className="mt-3 text-[11px] text-muted-foreground">Access is managed by the administrator in the server role registry.</p>
                </section>
            </div>

            <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
                <div className="mb-1 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Database className="h-4 w-4" /></span>
                    <div>
                        <h3 className="text-sm font-semibold">Data tools</h3>
                        <p className="text-[11px] text-muted-foreground">Import, export, audit and check workspace health.</p>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataImport")}><Upload className="h-3.5 w-3.5" /> Import</Button>
                    <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("dataExport")}><Download className="h-3.5 w-3.5" /> Export</Button>
                    <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("auditLog")}><History className="h-3.5 w-3.5" /> Audit log</Button>
                    <Button size="sm" variant="outline" className="min-h-[40px] gap-1.5" onClick={() => setActiveModule("integrity")}><HeartPulse className="h-3.5 w-3.5" /> Data health</Button>
                </div>
            </section>

            <p className="text-[11px] text-muted-foreground">
                Destructive workspace reset is intentionally unavailable here. Recovery and canonical reseeding require an audited maintenance procedure.
            </p>
        </div>
    );
}
