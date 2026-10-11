/** RFC 4180 CSV. A cell that a spreadsheet would run as a formula (=, +, -, @, tab, CR) is prefixed with '. */
export function toCsv<T>(rows: T[], columns: Array<[header: string, value: (row: T) => unknown]>): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(([h]) => cell(h)).join(",")];
  for (const row of rows) lines.push(columns.map(([, get]) => cell(get(row))).join(","));
  // (a BOM so Excel reads ₹ and Hindi names as UTF-8)
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** 2026-10-11 17:35 (India time), or "" */
export const istTime = (ms: number | null | undefined) =>
  ms ? new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ") : "";

/** Paise/cents as a plain decimal ("999.00"). */
export const units = (v: number | null | undefined) => ((v ?? 0) / 100).toFixed(2);
