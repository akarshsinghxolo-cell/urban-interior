import type { Master, RDashDatabase } from "../types";

export type ReferenceRow = { id: string } & Record<string, unknown>;

/** Embedded records retain their owning document; they are never extra tables. */
export const EMBEDDED_REFERENCE_PARENTS: Readonly<Record<string, string>> = {
  threadMessages: "threads",
  threadMessageAttachments: "threads",
  boqItems: "boqs",
};

function rows(value: unknown): ReferenceRow[] {
  return Array.isArray(value) ? value as ReferenceRow[] : [];
}

export function resolveReferenceCollection(db: RDashDatabase, name: string): ReferenceRow[] {
  if (name === "threadMessages") return (db.threads || []).flatMap((thread) => rows(thread.messages));
  if (name === "threadMessageAttachments") return (db.threads || []).flatMap((thread) => (thread.messages || []).flatMap((message) => rows(message.attachments)));
  if (name === "boqItems") return (db.boqs || []).flatMap((boq) => rows(boq.items));
  if (name.startsWith("master.")) return rows(db.master?.[name.slice(7) as keyof Master]);
  return rows(db[name as keyof RDashDatabase]);
}

export function replaceReferenceCollection(db: RDashDatabase, name: string, next: ReferenceRow[]): RDashDatabase {
  const byId = new Map(next.map((row) => [row.id, row]));
  const replace = (current: unknown) => {
    if (!Array.isArray(current)) return current;
    const updated = rows(current).flatMap((row) => {
      const replacement = byId.get(row.id);
      return replacement ? [replacement] : [];
    });
    return updated.length === current.length && updated.every((row, index) => row === current[index]) ? current : updated;
  };
  if (name === "threadMessages") return { ...db, threads: db.threads.map((thread) => {
    const messages = replace(thread.messages) as typeof thread.messages;
    return messages === thread.messages ? thread : { ...thread, messages };
  }) };
  if (name === "threadMessageAttachments") return { ...db, threads: db.threads.map((thread) => {
    const messages = thread.messages.map((message) => {
      const attachments = replace(message.attachments) as typeof message.attachments;
      return attachments === message.attachments ? message : { ...message, attachments };
    });
    return messages.every((message, index) => message === thread.messages[index]) ? thread : { ...thread, messages };
  }) };
  if (name === "boqItems") return { ...db, boqs: db.boqs.map((boq) => {
    const items = replace(boq.items) as typeof boq.items;
    return items === boq.items ? boq : { ...boq, items };
  }) };
  if (name.startsWith("master.")) return { ...db, master: { ...db.master, [name.slice(7)]: next } };
  return { ...db, [name]: next };
}

export function referenceField(row: ReferenceRow, field: string): unknown {
  return field.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, row);
}

export function replaceReferenceField(row: ReferenceRow, field: string, value: unknown): ReferenceRow {
  const keys = field.split(".");
  const result = { ...row };
  let current: Record<string, unknown> = result;
  for (const key of keys.slice(0, -1)) {
    const previous = current[key];
    const next = previous && typeof previous === "object" && !Array.isArray(previous) ? { ...previous as Record<string, unknown> } : {};
    current[key] = next;
    current = next;
  }
  const key = keys[keys.length - 1];
  if (value === undefined) delete current[key]; else current[key] = value;
  return result;
}
