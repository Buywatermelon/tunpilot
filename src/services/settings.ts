import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { settings } from "../db/schema";
import { sql } from "drizzle-orm";

export function getSetting(db: Db, key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updated_at: sql`(datetime('now'))` },
    })
    .run();
}

export function deleteSetting(db: Db, key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}

export function listSettings(db: Db): Array<{ key: string; masked_value: string; updated_at: string | null }> {
  const rows = db.select().from(settings).all();
  return rows.map(row => ({
    key: row.key,
    masked_value: row.value.length > 4
      ? row.value.slice(0, 4) + "*".repeat(row.value.length - 4)
      : "****",
    updated_at: row.updated_at,
  }));
}
