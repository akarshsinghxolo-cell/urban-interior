"use client";

import * as React from "react";
import { Bell, BellOff, Check, Shield, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getNotificationPreferences,
  requestNotificationPermission,
  saveNotificationPreferences,
  showDesktopNotification,
  type NotificationPreferences,
} from "@/lib/rdash/notifications";

type PermissionState = NotificationPermission | "unsupported";

function NotificationToggle({
  on,
  onClick,
  label,
  icon,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
        on ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30",
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium">
        {icon}
        {label}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-4 w-7 items-center rounded-full p-0.5 transition-colors",
          on ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
            on && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}

export function NotificationSettings() {
  const [settings, setSettings] = React.useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [permission, setPermission] = React.useState<PermissionState>("default");

  React.useEffect(() => {
    setSettings(getNotificationPreferences());
    setPermission("Notification" in window ? Notification.permission : "unsupported");
  }, []);

  const update = React.useCallback((patch: Partial<NotificationPreferences>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveNotificationPreferences(next);
      return next;
    });
  }, []);

  const enableNotifications = async () => {
    const granted = await requestNotificationPermission();
    const nextPermission: PermissionState =
      "Notification" in window ? Notification.permission : "unsupported";
    setPermission(nextPermission);

    if (granted) update({ enabled: true });
  };

  const testNotification = () => {
    showDesktopNotification("Urban Castle — Test", {
      body: "Notifications are working correctly!",
      icon: "/logo.svg",
      tag: "uc-notification-test",
      respectPreferences: false,
    });
  };

  const permissionLabel =
    permission === "granted"
      ? "Allowed"
      : permission === "denied"
        ? "Blocked"
        : permission === "unsupported"
          ? "Unsupported"
          : "Not set";

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bell className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-bold">Notification Settings</h3>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
            permission === "granted"
              ? "bg-success/10 text-success"
              : permission === "denied"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
          )}
        >
          {permissionLabel}
        </span>
      </div>

      {permission !== "granted" ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-center">
          <BellOff className="mx-auto mb-1.5 h-5 w-5 text-warning" />
          <p className="text-xs font-medium text-foreground">
            {permission === "denied"
              ? "Notifications are blocked"
              : permission === "unsupported"
                ? "Notifications are unavailable"
                : "Notifications are not enabled"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {permission === "denied"
              ? "Enable notifications in your browser settings to receive alerts."
              : permission === "unsupported"
                ? "This browser does not support desktop notifications."
                : "Enable notifications to get alerts for approvals and overdue items."}
          </p>
          {permission === "default" && (
            <button
              type="button"
              onClick={enableNotifications}
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enable notifications
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <NotificationToggle
            on={settings.enabled}
            onClick={() => update({ enabled: !settings.enabled })}
            label="All notifications"
            icon={<Bell className="h-3.5 w-3.5 text-primary" />}
          />
          {settings.enabled && (
            <>
              <NotificationToggle
                on={settings.approvals}
                onClick={() => update({ approvals: !settings.approvals })}
                label="Pending approvals"
                icon={<Shield className="h-3.5 w-3.5 text-success" />}
              />
              <NotificationToggle
                on={settings.overdue}
                onClick={() => update({ overdue: !settings.overdue })}
                label="Overdue items"
                icon={<Bell className="h-3.5 w-3.5 text-warning" />}
              />
              <NotificationToggle
                on={settings.sound}
                onClick={() => update({ sound: !settings.sound })}
                label={settings.sound ? "Sound on" : "Sound off"}
                icon={
                  settings.sound ? (
                    <Volume2 className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                  )
                }
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
