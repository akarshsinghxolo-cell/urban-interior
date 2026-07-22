/**
 * Desktop notifications utility — uses the browser Notification API.
 * Requests permission on first use, falls back to toast if denied.
 *
 * Features:
 * - Permission request (lazy, on first call)
 * - Notification with icon + body + click-to-navigate
 * - Fallback to console.log if notifications unsupported
 * - Auto-dismiss after 8 seconds
 */

let permissionRequested = false;

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (permissionRequested) return (Notification.permission as string) === "granted";
  permissionRequested = true;
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
    onClick?: () => void;
  } = {},
): void {
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.log(`[notification] ${title}: ${options.body || ""}`);
    return;
  }
  if (Notification.permission !== "granted") {
    console.log(`[notification] (permission not granted) ${title}: ${options.body || ""}`);
    return;
  }
  try {
    const notif = new Notification(title, {
      body: options.body || "",
      icon: options.icon || "/logo.svg",
      tag: options.tag || "uc-notification",
      badge: "/logo.svg",
    });
    if (options.onClick) {
      notif.onclick = () => {
        window.focus();
        options.onClick?.();
        notif.close();
      };
    }
    // Auto-dismiss after 8 seconds
    setTimeout(() => notif.close(), 8000);
  } catch (err) {
    console.warn("[notification] failed:", err);
  }
}

/**
 * Check pending approvals and show a desktop notification if new ones exist.
 * Called from the workspace on mount + periodic refresh.
 */
export function notifyPendingApprovals(pendingCount: number): void {
  if (pendingCount === 0) return;
  showDesktopNotification(`${pendingCount} approval${pendingCount === 1 ? "" : "s"} pending`, {
    body: `You have ${pendingCount} pending approval${pendingCount === 1 ? "" : "s"} to review in Urban Castle.`,
    tag: "uc-pending-approvals",
    onClick: () => {
      window.location.href = "/?module=approvals";
    },
  });
}
