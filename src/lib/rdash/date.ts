export function indiaDate(value: Date | string = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${read("year")}-${read("month")}-${read("day")}`;
}
export function isDateOnlyOverdue(dueDate?: string, now: Date | string = new Date()) {
    return Boolean(dueDate && dueDate < indiaDate(now));
}
