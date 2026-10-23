import type { AttendanceRecord } from "./types";

function score(record: AttendanceRecord): [number, number] {
  return [record.auto_generated ? 0 : 1, Date.parse(record.updated_at || record.created_at || "") || 0];
}

/** One operational attendance summary per staff/date, even while legacy duplicates are being repaired. */
export function canonicalAttendanceRecords(records: AttendanceRecord[]): AttendanceRecord[] {
  const byStaffDate = new Map<string, AttendanceRecord>();
  for (const record of records) {
    const key = `${record.staff_id}\u0000${record.date}`;
    const current = byStaffDate.get(key);
    if (!current) {
      byStaffDate.set(key, record);
      continue;
    }
    const candidateScore = score(record);
    const currentScore = score(current);
    if (candidateScore[0] > currentScore[0] || (candidateScore[0] === currentScore[0] && candidateScore[1] > currentScore[1])) {
      byStaffDate.set(key, record);
    }
  }
  return [...byStaffDate.values()];
}
