import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "@/lib/db/schema";

/**
 * Prepares every static SQL statement in lib/ and app/api against the real schema. SQLite reads
 * an unquoted word as a column name, so `SET status = refunded` only fails at runtime ("no such
 * column"), after the code before it already ran (that once refunded money without recording it).
 */
const ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("static SQL", () => {
  it("every literal statement compiles against SCHEMA_SQL", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA_SQL);
    const failures: string[] = [];
    let checked = 0;
    for (const file of [...sourceFiles(join(ROOT, "lib")), ...sourceFiles(join(ROOT, "app", "api"))]) {
      const src = readFileSync(file, "utf8");
      const re = /\.(?:prepare|exec)\(\s*(`[\s\S]*?`|"[^"\n]*"|'[^'\n]*')/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const sql = m[1].slice(1, -1);
        if (m[1][0] === "`" && sql.includes("${")) continue; // built at runtime
        if (!/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) continue;
        checked++;
        try {
          db.prepare(sql);
        } catch (err) {
          const line = src.slice(0, m.index).split("\n").length;
          failures.push(`${relative(ROOT, file)}:${line} ${(err as Error).message}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(failures).toEqual([]);
  });
});
