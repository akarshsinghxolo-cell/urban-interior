/**
 * RFC 5545 (.ics) calendar export — pure builders, no DOM.
 *
 * Produces a valid VCALENDAR document from workspace events so field staff
 * can add visits / task deadlines / payment dues / PO deliveries to their
 * phone calendar (Google Calendar / Apple Calendar both accept .ics files).
 */

export interface IcsEventInput {
    /** Globally stable unique id, e.g. the workspace record id. */
    uid: string;
    /** Event summary shown in the calendar app. */
    title: string;
    /** ISO date "YYYY-MM-DD". */
    date: string;
    /** Optional 24h time "HH:mm". When omitted the event is all-day. */
    time?: string;
    /** Optional description body. */
    description?: string;
    /** Optional location. */
    location?: string;
}

/** Fold content lines at 75 octets per RFC 5545 §3.1 (continuation = CRLF + space). */
export function foldIcsLine(line: string): string {
    const folded: string[] = [];
    let rest = line;
    while (rest.length > 75) {
        folded.push(rest.slice(0, 75));
        rest = " " + rest.slice(75);
    }
    folded.push(rest);
    return folded.join("\r\n");
}

/** Escape TEXT values per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
export function escapeIcsText(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

/** "YYYY-MM-DD" → "YYYYMMDD" (no validation of calendar semantics needed here). */
export function icsDateOnly(isoDate: string): string {
    return isoDate.replaceAll("-", "");
}

/** "HH:mm" (or "HH:mm:ss") → "HHmmss"; falls back to 000000. */
export function icsTimeOnly(time?: string): string {
    const match = /^(\d{1,2}):(\d{2})/.exec((time || "").trim());
    if (!match) return "000000";
    return `${match[1].padStart(2, "0")}${match[2]}00`;
}

/** Fixed UTC timestamp for DTSTAMP (RFC 5545 §3.3.5 form #2). */
function icsUtcStamp(at: Date): string {
    return (
        at.getUTCFullYear().toString().padStart(4, "0") +
        String(at.getUTCMonth() + 1).padStart(2, "0") +
        String(at.getUTCDate()).padStart(2, "0") +
        "T" +
        String(at.getUTCHours()).padStart(2, "0") +
        String(at.getUTCMinutes()).padStart(2, "0") +
        String(at.getUTCSeconds()).padStart(2, "0") +
        "Z"
    );
}

/**
 * Build a complete .ics document. Timed events use floating local time
 * (no TZID/Z) which Google & Apple resolve in the phone's local timezone —
 * the workspace already stores IST business times.
 */
export function buildCalendarICS(events: readonly IcsEventInput[], options?: { calendarName?: string; generatedAt?: Date }): string {
    const generatedAt = options?.generatedAt ?? new Date();
    const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Urban Castle//Business Workspace//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${escapeIcsText(options?.calendarName || "Urban Castle Schedule")}`,
    ];
    for (const event of events) {
        const dtstart = event.time
            ? `DTSTART:${icsDateOnly(event.date)}T${icsTimeOnly(event.time)}00`
            : `DTSTART;VALUE=DATE:${icsDateOnly(event.date)}`;
        lines.push(
            "BEGIN:VEVENT",
            `UID:${escapeIcsText(event.uid)}`,
            `DTSTAMP:${icsUtcStamp(generatedAt)}`,
            foldIcsLine(`SUMMARY:${escapeIcsText(event.title)}`),
            dtstart,
        );
        if (event.description?.trim()) {
            lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description.trim())}`));
        }
        if (event.location?.trim()) {
            lines.push(foldIcsLine(`LOCATION:${escapeIcsText(event.location.trim())}`));
        }
        lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
}
