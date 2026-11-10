import type { AttributeValue } from '../core/types';
import type { Table } from './table';

export type CsvSeparator = ',' | ';' | '\t';

function cell(v: AttributeValue, sep: CsvSeparator, decimalComma: boolean): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else if (typeof v === 'number') s = decimalComma ? String(v).replace('.', ',') : String(v);
  else s = v;
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Sérialise une table en CSV (RFC 4180), précédé d'un BOM UTF-8 pour qu'Excel
 * reconnaisse les accents. Avec le séparateur « ; » (Excel en français), les
 * nombres utilisent la virgule décimale.
 */
export function toCsv(table: Table, sep: CsvSeparator = ','): string {
  const decimalComma = sep === ';';
  const lines = [table.columns.map((c) => cell(c.name, sep, false)).join(sep)];
  for (const row of table.rows) lines.push(row.map((v) => cell(v, sep, decimalComma)).join(sep));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
