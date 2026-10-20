// CSV для Excel: разделитель «;» и BOM, чтобы кириллица открывалась без настройки кодировки.
const escape = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escape).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}
