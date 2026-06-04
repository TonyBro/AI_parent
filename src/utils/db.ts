export type DbRow = Record<string, unknown>;

export function nowMs(): number {
  return Date.now();
}

export async function dbGet<T extends DbRow>(
  db: D1Database,
  sql: string,
  bindings: unknown[] = [],
): Promise<T | null> {
  const res = await db.prepare(sql).bind(...bindings).first<T>();
  return res ?? null;
}

export async function dbAll<T extends DbRow>(
  db: D1Database,
  sql: string,
  bindings: unknown[] = [],
): Promise<T[]> {
  const res = await db.prepare(sql).bind(...bindings).all<T>();
  return res.results ?? [];
}

export async function dbRun(
  db: D1Database,
  sql: string,
  bindings: unknown[] = [],
): Promise<void> {
  await db.prepare(sql).bind(...bindings).run();
}








