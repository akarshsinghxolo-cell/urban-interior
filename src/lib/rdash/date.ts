import { indiaBusinessDate } from "./format";

export function indiaDate(value: Date | string = new Date()) {
    return indiaBusinessDate(value);
}
export function isDateOnlyOverdue(dueDate?: string, now: Date | string = new Date()) {
    return Boolean(dueDate && dueDate < indiaDate(now));
}
