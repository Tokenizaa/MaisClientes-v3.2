import { PlaceRecord, EXPORTABLE_FIELDS } from '../../shared/types';

/**
 * Sanitizes a cell value to prevent CSV Formula Injection in Excel and LibreOffice.
 * If a value starts with =, +, -, @, \t, or \r, prefix it with an apostrophe.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = typeof value === 'object' ? JSON.stringify(value) : String(value);

  // Protect formulas even when the cell starts with whitespace/control characters.
  if (/^[\s\u0000-\u001F]*[=+\-@]/.test(str) || /^[\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If string contains comma, double quote, or newline, escape double quotes and wrap in quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generates a full CSV string with UTF-8 BOM, compliant headers, and sanitized cells.
 */
export function generateCsv(
  records: PlaceRecord[],
  selectedFieldKeys?: (keyof PlaceRecord)[]
): string {
  // If user provided specific field keys, respect that exact order
  const fields = selectedFieldKeys && selectedFieldKeys.length > 0
    ? selectedFieldKeys.map(key => EXPORTABLE_FIELDS.find(f => f.key === key)!).filter(Boolean)
    : EXPORTABLE_FIELDS;

  // Header row
  const headerRow = fields.map(f => sanitizeCsvCell(f.label)).join(',');

  // Data rows
  const rows = records.map(record => {
    return fields.map(f => {
      const val = record[f.key] ?? '';
      return sanitizeCsvCell(val);
    }).join(',');
  });

  // UTF-8 BOM: \uFEFF ensures Excel and LibreOffice detect UTF-8 correctly
  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
}
