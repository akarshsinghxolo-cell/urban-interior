import type { PGlite } from "@electric-sql/pglite";

type Column = { table: string; column: string; expression: string | null };
export type Constraint = { table: string; name: string; type: string; definition: string; validated: boolean; target: string; source_columns: string[]; target_columns: string[] };
export type DatabaseReference = { collection: string; field: string; targetCollection: string; scoped: boolean; validated: boolean; constraint: Constraint };

const unquote = (name: string) => name.replace(/^public\./, "").replaceAll('"', "");

export async function constraints(db: PGlite): Promise<Constraint[]> {
  return (await db.query<Constraint>(`SELECT c.conrelid::regclass::text AS table,c.conname AS name,c.contype AS type,pg_get_constraintdef(c.oid) AS definition,c.convalidated AS validated,c.confrelid::regclass::text AS target,
    ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.pos) AS source_columns,
    ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.pos) AS target_columns
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','private')`)).rows;
}

export async function collectionMapping(db: PGlite): Promise<Record<string, string>> {
  const result = await db.query<{ definition: string }>("SELECT pg_get_functiondef('public.uc_collection_table(text)'::regprocedure) AS definition");
  return Object.fromEntries(Array.from(result.rows[0].definition.matchAll(/WHEN '([^']+)' THEN '([^']+)'/g), (match) => [match[1], match[2]]));
}

/** Read the actual PostgreSQL catalogue, including discriminator expressions. */
export async function databaseReferences(db: PGlite): Promise<DatabaseReference[]> {
  const mapping = await collectionMapping(db);
  const reverse = new Map<string, string[]>();
  for (const [kind, table] of Object.entries(mapping)) reverse.set(table, [...(reverse.get(table) || []), kind]);
  const columns = (await db.query<Column>(`SELECT c.relname AS table,a.attname AS column,pg_get_expr(d.adbin,d.adrelid) AS expression FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  const expressions = new Map(columns.map((column) => [`${column.table}:${column.column}`, column.expression || column.column]));
  const references: DatabaseReference[] = [];
  for (const constraint of await constraints(db)) {
    if (constraint.type !== "f") continue;
    const table = unquote(constraint.table);
    const target = unquote(constraint.target);
    const sourceKinds = reverse.get(table);
    const targetKinds = reverse.get(target);
    if (!sourceKinds || !targetKinds || !constraint.target_columns.includes("id")) continue;
    const expression = (column: string) => expressions.get(`${table}:${column}`) || column;
    const idExpression = expression(constraint.source_columns[constraint.target_columns.indexOf("id")]);
    const fields = [...idExpression.matchAll(/data ->> '([^']+)'/g)].map((match) => match[1]);
    const path = idExpression.match(/data #>> '\{([^}]+)\}'/);
    if (path) fields.push(path[1].replaceAll(",", "."));
    if (new Set(fields).size !== 1) throw new Error(`Cannot identify FK field: ${constraint.name}`);
    const kinds = new Set(constraint.source_columns.flatMap((column) => Array.from(expression(column).matchAll(/collection = '([^']+)'/g), (match) => match[1])));
    const collection = sourceKinds.length === 1 ? sourceKinds[0] : kinds.size === 1 ? [...kinds][0] : undefined;
    if (!collection) throw new Error(`Missing source kind guard: ${constraint.name}`);
    let targetCollection = targetKinds[0];
    if (targetKinds.length > 1) {
      const kindExpression = expression(constraint.source_columns[constraint.target_columns.indexOf("collection")]);
      targetCollection = kindExpression.match(/THEN '([^']+)'/)?.[1]
        || targetKinds.find((kind) => kindExpression.includes(`'${kind}'`)) || "";
      if (!targetCollection) throw new Error(`Missing target kind: ${constraint.name}`);
    }
    references.push({ collection, field: fields[0], targetCollection, scoped: constraint.target_columns.includes("workspace_id"), validated: constraint.validated, constraint });
  }
  return references;
}

/** Include compound party/job columns and deletion/deferral semantics, not just IDs. */
export async function foreignKeyFingerprints(db: PGlite): Promise<string[]> {
  const all = await constraints(db);
  const typed = new Map((await databaseReferences(db)).map((reference) => [reference.constraint.name, reference]));
  const columns = (await db.query<Column>(`SELECT c.relname AS table,a.attname AS column,pg_get_expr(d.adbin,d.adrelid) AS expression
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname IN ('public','private') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  const expressions = new Map(columns.map((column) => [`${column.table}:${column.column}`, column.expression || column.column]));
  const meaning = (table: string, column: string) => {
    const expression = expressions.get(`${unquote(table)}:${column}`) || column;
    const field = expression.match(/data ->> '([^']+)'/)?.[1]
      || expression.match(/data #>> '\{([^}]+)\}'/)?.[1].replaceAll(",", ".");
    if (field) return `data.${field}`;
    if (/\bworkspace_id\b/.test(expression)) return "workspace_id";
    return column;
  };
  return all.filter((constraint) => constraint.type === "f").map((constraint) => {
    const reference = typed.get(constraint.name);
    if (!reference) return JSON.stringify([constraint.table, constraint.definition]);
    const pairs = constraint.target_columns.flatMap((column, index) => column === "collection" ? [] : [[
      meaning(constraint.table, constraint.source_columns[index]), meaning(constraint.target, column),
    ]]);
    const semantics = constraint.definition.slice(constraint.definition.lastIndexOf(")") + 1);
    return JSON.stringify([reference.collection, reference.targetCollection, pairs, semantics]);
  }).sort();
}
