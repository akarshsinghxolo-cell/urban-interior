import { describe, expect, it } from "vitest";
import {
    buildCalendarICS,
    escapeIcsText,
    foldIcsLine,
    icsDateOnly,
    icsTimeOnly,
    type IcsEventInput,
} from "@/lib/rdash/calendar-ics";

describe("calendar-ics", () => {
    const sample: IcsEventInput[] = [
        { uid: "visit-1", title: "Site visit · Shubh Vasundhara", date: "2026-08-30", time: "14:30", description: "Check tile alignment", location: "Spencer, Goa" },
        { uid: "task-2", title: "Payment follow-up, call Rahul; urgent", date: "2026-08-31" },
    ];

    it("produces a valid VCALENDAR envelope with CRLF endings", () => {
        const ics = buildCalendarICS(sample, { generatedAt: new Date("2026-08-29T12:00:00Z") });
        expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
        expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
        expect(ics).toContain("VERSION:2.0");
        expect(ics).toContain("PRODID:-//Urban Castle//Business Workspace//EN");
        expect(ics).toContain("X-WR-CALNAME:Urban Castle Schedule");
        // Every structural line ends with CRLF (no bare \n)
        expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    });

    it("emits all-day DTSTART for date-only events and floating time for timed events", () => {
        const ics = buildCalendarICS(sample);
        expect(ics).toContain("DTSTART;VALUE=DATE:20260831");
        expect(ics).toContain("DTSTART:20260830T143000");
        expect(ics).not.toContain("TZID");
        // DTSTAMP is UTC-form
        expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    });

    it("escapes text values and folds long lines", () => {
        expect(escapeIcsText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
        expect(escapeIcsText("line1\nline2")).toBe("line1\\nline2");
        const long = "SUMMARY:" + "x".repeat(200);
        const folded = foldIcsLine(long);
        const segments = folded.split("\r\n");
        expect(segments[0].length).toBe(75);
        expect(segments.every((s, i) => i === 0 || s.startsWith(" "))).toBe(true);
        // Unfolding (RFC: strip CRLF + single leading space) restores the original line
        expect(segments.map((s, i) => (i === 0 ? s : s.slice(1))).join("")).toBe(long);
        const ics = buildCalendarICS([{ uid: "u", title: "x".repeat(200), date: "2026-08-30" }]);
        expect(ics).toContain("SUMMARY:" + "x".repeat(67) + "\r\n " + "x");
        // No description/location on that event → those properties are omitted
        expect(ics).not.toContain("DESCRIPTION:");
        expect(ics).not.toContain("LOCATION:");
    });

    it("normalizes dates and times", () => {
        expect(icsDateOnly("2026-08-30")).toBe("20260830");
        expect(icsTimeOnly("9:05")).toBe("090500");
        expect(icsTimeOnly("14:30")).toBe("143000");
        expect(icsTimeOnly(undefined)).toBe("000000");
        expect(icsTimeOnly("garbage")).toBe("000000");
    });

    it("round-trips event count and stable UIDs", () => {
        const ics = buildCalendarICS(sample);
        expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
        expect(ics.match(/END:VEVENT/g)?.length).toBe(2);
        expect(ics).toContain("UID:visit-1");
        expect(ics).toContain("UID:task-2");
        expect(ics).toContain("LOCATION:Spencer\\, Goa");
    });
});
