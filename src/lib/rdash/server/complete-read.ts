interface Page<T> {
    data: T[] | null;
    error: { message: string } | null;
    count?: number | null;
}

/** Complete analytical inputs, even when the API cap is below our requested range. */
export async function readCompletePages<T extends { id: string }>(
    label: string,
    readPage: (offset: number, end: number, count: boolean) => PromiseLike<Page<T>>,
) {
    const rows: T[] = [];
    const ids = new Set<string>();
    let queryCount = 0;
    let expected: number | undefined;
    while (true) {
        const { data, error, count } = await readPage(rows.length, rows.length + 499, queryCount === 0);
        queryCount++;
        if (error) throw new Error(`Could not read ${label}: ${error.message}`);
        if (typeof count === "number") expected = count;
        const page = data || [];
        if (!page.length) {
            if (expected !== undefined && rows.length !== expected) throw new Error("READ_CONFLICT");
            break;
        }
        for (const row of page) {
            // A repeated page or shifting offset must fail instead of reporting a false total.
            if (ids.has(row.id)) throw new Error("READ_CONFLICT");
            ids.add(row.id);
            rows.push(row);
        }
        if (expected !== undefined && rows.length >= expected) {
            if (rows.length !== expected) throw new Error("READ_CONFLICT");
            break;
        }
        // Without a count, continue to an empty page: a short page may be an API cap.
    }
    return { rows, queryCount };
}
