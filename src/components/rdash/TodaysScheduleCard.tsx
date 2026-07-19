"use client";
import * as React from "react";
import { CheckCircle2, Clock, MapPin, Navigation, User } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { indiaDate } from "@/lib/rdash/date";
import { cn } from "@/lib/utils";

/** Today's field visits in a compact timeline — gives the Owner an instant daily schedule view. */
export function TodaysScheduleCard() {
    const db = useRDashStore((s) => s.db);
    const openDetail = useRDashStore((s) => s.openDetail);
    const today = indiaDate();

    const todaysVisits = db.visits
        .filter((v) => v.scheduled_at?.startsWith(today))
        .sort((a, b) => (a.scheduled_at || "").localeCompare(b.scheduled_at || ""))
        .slice(0, 6);

    const completedToday = todaysVisits.filter((v) => v.status === "completed").length;
    const activeNow = todaysVisits.filter((v) => v.status === "en_route" || v.status === "checked_in").length;
    const upcoming = todaysVisits.filter((v) => v.status === "scheduled").length;

    return (
        <section aria-label="Today's schedule" className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Navigation className="h-4 w-4" />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold tracking-tight">Today's Field Schedule</h3>
                        <p className="text-[11px] text-muted-foreground">{todaysVisits.length} visit{todaysVisits.length !== 1 ? "s" : ""} planned</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {activeNow > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                            {activeNow} active
                        </span>
                    )}
                    {completedToday > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            <CheckCircle2 className="h-3 w-3" />
                            {completedToday} done
                        </span>
                    )}
                    {upcoming > 0 && (
                        <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                            <Clock className="h-3 w-3" />
                            {upcoming} upcoming
                        </span>
                    )}
                </div>
            </div>

            {todaysVisits.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
                    <MapPin className="h-6 w-6 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">No field visits scheduled for today</p>
                </div>
            ) : (
                <div className="relative space-y-0.5">
                    {todaysVisits.map((visit, idx) => {
                        const time = visit.scheduled_at
                            ? new Date(visit.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
                            : "—";
                        const isCompleted = visit.status === "completed";
                        const isActive = visit.status === "en_route" || visit.status === "checked_in";
                        return (
                            <button
                                key={visit.id}
                                type="button"
                                onClick={() => openDetail("visit", visit.id)}
                                className={cn(
                                    "group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/40",
                                    isActive && "bg-success/5"
                                )}
                            >
                                {/* Timeline dot */}
                                <div className="relative flex flex-col items-center">
                                    <span
                                        className={cn(
                                            "h-2.5 w-2.5 rounded-full border-2 border-card",
                                            isCompleted ? "bg-success" : isActive ? "bg-primary" : "bg-muted-foreground/30"
                                        )}
                                    />
                                    {idx < todaysVisits.length - 1 && (
                                        <span className="absolute top-2.5 h-full w-px bg-border" />
                                    )}
                                </div>

                                {/* Time */}
                                <span className="rd-tabular w-14 shrink-0 text-xs font-semibold text-muted-foreground">{time}</span>

                                {/* Content */}
                                <div className="min-w-0 flex-1">
                                    <p className={cn("truncate text-xs font-medium", isCompleted ? "text-muted-foreground line-through" : "text-foreground")}>
                                        {visit.location_name || "Field visit"}
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <span className="flex items-center gap-0.5">
                                            <User className="h-2.5 w-2.5" />
                                            {visit.staff_name || "Unassigned"}
                                        </span>
                                        <span>·</span>
                                        <span className="capitalize">{visit.visit_type || "visit"}</span>
                                    </div>
                                </div>

                                {/* Status badge */}
                                <span
                                    className={cn(
                                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize",
                                        isCompleted ? "bg-success/10 text-success" :
                                        isActive ? "bg-primary/10 text-primary" :
                                        "bg-muted text-muted-foreground"
                                    )}
                                >
                                    {visit.status.replace("_", " ")}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
