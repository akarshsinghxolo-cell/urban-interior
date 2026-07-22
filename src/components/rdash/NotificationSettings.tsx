"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Bell, BellOff, Volume2, VolumeX, Shield, Check } from "lucide-react";

/**
 * NotificationSettings — a compact panel for controlling desktop notification
 * preferences. Stored in localStorage.
 *
 * Features:
 * - Enable/disable desktop notifications (requests permission)
 * - Toggle per-category: approvals, overdue, integrity
 * - Sound on/off
 * - Permission status indicator
 * - Test notification button
 */

interface NotifSettings {
  enabled: boolean;
  approvals: boolean;
  overdue: boolean;
  integrity: boolean;
  sound: boolean;
}

const STORAGE_KEY = "uc_notif_settings";
const DEFAULTS: NotifSettings = {
  enabled: true,
  approvals: true,
  overdue: true,
  integrity: false,
  sound: true,
};

function loadSettings(): NotifSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch { /* non-fatal */ }
  return DEFAULTS;
}

function saveSettings(s: NotifSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* non-fatal */ }
}

export function NotificationSettings() {
  const [settings, setSettings] = React.useState<NotifSettings>(DEFAULTS);
  const [permission, setPermission] = React.useState<string>("default");

  React.useEffect(() => {
    setSettings(loadSettings());
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const update = (patch: Partial<NotifSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const requestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const testNotification = () => {
    if (permission !== "granted") return;
    try {
      new Notification("Urban Castle — Test", {
        body: "Notifications are working correctly!",
        icon: "/logo.svg",
      });
    } catch { /* non-fatal */ }
  };

  const Toggle = ({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
        on ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium">
        {icon}
        {label}
      </span>
      <span className={cn("flex h-4 w-7 items-center rounded-full p-0.5 transition-colors", on ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("h-3 w-3 rounded-full bg-white shadow-sm transition-transform", on && "translate-x-3")} />
      </span>
    </button>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-bold">Notification Settings</h3>
        </div>
        {/* Permission status */}
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
          permission === "granted" ? "bg-success/10 text-success" :
          permission === "denied" ? "bg-destructive/10 text-destructive" :
          "bg-muted text-muted-foreground"
        )}>
          {permission === "granted" ? "Enabled" : permission === "denied" ? "Blocked" : "Not set"}
        </span>
      </div>

      {permission !== "granted" ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-center">
          <BellOff className="mx-auto mb-1.5 h-5 w-5 text-warning" />
          <p className="text-xs font-medium text-foreground">Notifications are {permission === "denied" ? "blocked" : "not enabled"}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {permission === "denied"
              ? "Enable notifications in your browser settings to receive alerts."
              : "Enable notifications to get alerts for approvals and overdue items."}
          </p>
          {permission !== "denied" && (
            <button
              type="button"
              onClick={requestPermission}
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enable notifications
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Toggle
            on={settings.enabled}
            onClick={() => update({ enabled: !settings.enabled })}
            label="All notifications"
            icon={<Bell className="h-3.5 w-3.5 text-primary" />}
          />
          {settings.enabled && (
            <>
              <Toggle
                on={settings.approvals}
                onClick={() => update({ approvals: !settings.approvals })}
                label="Pending approvals"
                icon={<Shield className="h-3.5 w-3.5 text-success" />}
              />
              <Toggle
                on={settings.overdue}
                onClick={() => update({ overdue: !settings.overdue })}
                label="Overdue items"
                icon={<Bell className="h-3.5 w-3.5 text-warning" />}
              />
              <Toggle
                on={settings.sound}
                onClick={() => update({ sound: !settings.sound })}
                label={settings.sound ? "Sound on" : "Sound off"}
                icon={settings.sound ? <Volume2 className="h-3.5 w-3.5 text-primary" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
              />
              <button
                type="button"
                onClick={testNotification}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/60"
              >
                <Check className="h-3.5 w-3.5 text-success" />
                Send test notification
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
