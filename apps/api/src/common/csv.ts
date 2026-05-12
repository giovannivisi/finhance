import { BadRequestException } from '@nestjs/common';

export interface ParsedCsvRecord {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedCsvTable {
  headers: string[];
  rows: ParsedCsvRecord[];
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += character;
  }

  if (inQuotes) {
    throw new BadRequestException(
      'CSV parsing failed because a quoted field was not closed.',
    );
  }

  currentRow.push(currentField);
  rows.push(currentRow);
  return rows;
}

export function parseCsvTable(
  text: string,
  options: {
    emptyMessage?: string;
    trimBom?: boolean;
  } = {},
): ParsedCsvTable {
  const normalizedText =
    options.trimBom === false ? text : text.replace(/^\uFEFF/, '');
  const rawRows = parseCsvRows(normalizedText);

  if (rawRows.length === 0 || rawRows[0].every((cell) => cell.trim() === '')) {
    throw new BadRequestException(options.emptyMessage ?? 'CSV file is empty.');
  }

  const headers = rawRows[0].map((value) => value.trim());
  const rows = rawRows
    .slice(1)
    .filter((rawRow) => !rawRow.every((value) => value.trim() === ''))
    .map((rawRow, index) => {
      const rowNumber = index + 2;

      if (rawRow.length > headers.length) {
        throw new BadRequestException(
          `CSV row ${rowNumber} has more columns than the header row.`,
        );
      }

      const values = rawRow.map((value) => value.trim());
      const record: Record<string, string> = {};

      headers.forEach((header, headerIndex) => {
        record[header] = values[headerIndex] ?? '';
      });

      return {
        rowNumber,
        values: record,
      };
    });

  return { headers, rows };
}

export function neutralizeSpreadsheetFormula(value: string): string {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function restoreSpreadsheetFormulaPrefix(
  value: string | undefined,
): string {
  const normalized = value ?? '';

  if (normalized.startsWith("'") && /^[\s]*[=+\-@]/.test(normalized.slice(1))) {
    return normalized.slice(1);
  }

  return normalized;
}

export function serializeCsv(options: {
  headers: readonly string[];
  rows: ReadonlyArray<Record<string, string>>;
  quote?: 'all' | 'minimal';
  trailingNewline?: boolean;
}): string {
  const quote = options.quote ?? 'minimal';
  const lines = [
    options.headers.join(','),
    ...options.rows.map((row) =>
      options.headers
        .map((header) => escapeCsvField(row[header] ?? '', quote))
        .join(','),
    ),
  ];
  const serialized = lines.join('\n');

  return options.trailingNewline ? `${serialized}\n` : serialized;
}

function escapeCsvField(value: string, quote: 'all' | 'minimal'): string {
  const sanitized = neutralizeSpreadsheetFormula(value);

  if (quote === 'minimal' && !/[",\n\r]/.test(sanitized)) {
    return sanitized;
  }

  return `"${sanitized.replace(/"/g, '""')}"`;
}
