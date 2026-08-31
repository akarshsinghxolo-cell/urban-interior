/**
 * Desktop notification helpers.
 *
 * Permission is only requested during an active user gesture. Notification
 * preferences are shared with the settings panel and enforced at dispatch
 * time so disabling a category actually stops its notifications.
 */

type NotificationCategory = "approvals" | "overdue" | "integrity";

export interface NotificationPreferences {
  enabled: boolean;
  approvals: boolean;
  overdue: boolean;
  integrity: boolean;
  sound: boolean;
}

const NOTIFICATION_SETTINGS_STORAGE_KEY = "uc_notif_settings";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  approvals: true,
  overdue: true,
  integrity: false,
  sound: true,
};

const LAST_PENDING_APPROVAL_COUNT_KEY = "uc_last_pending_approval_count";

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_PREFERENCES;

  try {
    const stored = window.localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_NOTIFICATION_PREFERENCES;

    const parsed = JSON.parse(stored) as Partial<NotificationPreferences>;
    return {
      enabled: readBoolean(parsed.enabled, DEFAULT_NOTIFICATION_PREFERENCES.enabled),
      approvals: readBoolean(parsed.approvals, DEFAULT_NOTIFICATION_PREFERENCES.approvals),
      overdue: readBoolean(parsed.overdue, DEFAULT_NOTIFICATION_PREFERENCES.overdue),
      integrity: readBoolean(parsed.integrity, DEFAULT_NOTIFICATION_PREFERENCES.integrity),
      sound: readBoolean(parsed.sound, DEFAULT_NOTIFICATION_PREFERENCES.sound),
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function saveNotificationPreferences(settings: NotificationPreferences): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

/**
 * Browser permission prompts must be triggered by a user action. The workspace
 * still calls this helper during mount for backwards compatibility, but that
 * call now safely returns without prompting because user activation is absent.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const userActivation = navigator.userActivation;
  if (userActivation && !userActivation.isActive) return false;

  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function showDesktopNotification(
  title: string,
  options: {
    body?: string;
    icon?: string;
    tag?: string;
    category?: NotificationCategory;
    respectPreferences?: boolean;
    onClick?: () => void;
  } = {},
): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const settings = getNotificationPreferences();
  if (options.respectPreferences !== false) {
    if (!settings.enabled) return false;
    if (options.category && !settings[options.category]) return false;
  }

  try {
    const notification = new Notification(title, {
      body: options.body || "",
      icon: options.icon || "/logo.svg",
      tag: options.tag || "uc-notification",
      badge: "/logo.svg",
      silent: !settings.sound,
    });

    if (options.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    window.setTimeout(() => notification.close(), 8000);
    return true;
  } catch (error) {
    console.warn("[notification] failed:", error);
    return false;
  }
}

/**
 * Show an approval alert only when the pending count increases. The last count
 * is kept per browser tab, preventing repeated alerts after unrelated workspace
 * updates while still allowing a later newly-added approval to notify.
 */
export function notifyPendingApprovals(pendingCount: number): void {
  if (typeof window === "undefined") return;

  if (pendingCount <= 0) {
    try {
      window.sessionStorage.removeItem(LAST_PENDING_APPROVAL_COUNT_KEY);
    } catch {
      // Non-fatal; duplicate suppression is best effort.
    }
    return;
  }

  const settings = getNotificationPreferences();
  if (!settings.enabled || !settings.approvals) return;

  let previousCount: number | null = null;
  try {
    const stored = window.sessionStorage.getItem(LAST_PENDING_APPROVAL_COUNT_KEY);
    const parsed = stored === null ? Number.NaN : Number(stored);
    previousCount = Number.isFinite(parsed) ? parsed : null;
  } catch {
    // Non-fatal; continue without duplicate suppression.
  }

  if (previousCount !== null && pendingCount <= previousCount) {
    try {
      window.sessionStorage.setItem(LAST_PENDING_APPROVAL_COUNT_KEY, String(pendingCount));
    } catch {
      // Non-fatal.
    }
    return;
  }

  const shown = showDesktopNotification(
    `${pendingCount} approval${pendingCount === 1 ? "" : "s"} pending`,
    {
      body: `You have ${pendingCount} pending approval${pendingCount === 1 ? "" : "s"} to review in Urban Castle.`,
      tag: "uc-pending-approvals",
      category: "approvals",
      onClick: () => {
        window.location.href = "/?module=approvals";
      },
    },
  );

  if (shown) {
    try {
      window.sessionStorage.setItem(LAST_PENDING_APPROVAL_COUNT_KEY, String(pendingCount));
    } catch {
      // Non-fatal.
    }
  }
}
