"use client";

/**
 * Client helper for the calendar .ics export flow.
 *
 * Prefers the Web Share API level-2 file sharing when available (Android
 * Chrome/Edge: the shared .ics opens straight into the "Add to calendar"
 * chooser of Google Calendar / Samsung Calendar), and falls back to a plain
 * file download everywhere else (iOS Safari download, desktop browsers).
 */
export type IcsDelivery = "shared" | "downloaded";

export async function shareOrDownloadIcsFile(
    ics: string,
    filename: string,
    shareTitle = "Urban Castle calendar export",
): Promise<IcsDelivery> {
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const share = nav?.share?.bind(nav);
    const canShare = nav?.canShare?.bind(nav);

    if (share && canShare) {
        try {
            const file = new File([blob], filename, { type: "text/calendar" });
            if (canShare({ files: [file] })) {
                await share({ files: [file], title: shareTitle });
                return "shared";
            }
        } catch (error) {
            // User cancelled the share sheet — nothing left to do.
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            // Any other share failure falls through to the download path.
        }
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "downloaded";
}

export function isIcsShareAbort(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}
