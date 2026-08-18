import { BadRequestException } from '@nestjs/common';
import { parseCsvTable } from '@/common/csv';
import type { ImportFileType, ImportRowIssueResponse } from '@finhance/shared';
import {
  IMPORT_TEMPLATE_HEADERS,
  IMPORT_TEMPLATE_OPTIONAL_HEADERS,
  type ImportPayload,
  type ImportUploadFile,
} from '@imports/imports.types';

export const MAX_IMPORT_ROWS_PER_FILE = 5_000;
export const MAX_IMPORT_TOTAL_ROWS = 20_000;

const MAX_UPLOAD_FILE_BYTES = 1024 * 1024;

export type CsvRecord = Record<string, string>;
type CsvRecordRow = { rowNumber: number; values: CsvRecord };
type RowParser = (rowNumber: number, values: CsvRecord) => unknown;

interface ImportCsvParserHandlers {
  issue: (
    file: ImportFileType,
    rowNumber: number,
    field: string | null,
    message: string,
  ) => ImportRowIssueResponse;
  describeError: (error: unknown) => string;
  rowParsers: Partial<Record<ImportFileType, RowParser>>;
}

interface ParsedImportFiles {
  payload: ImportPayload;
  issues: ImportRowIssueResponse[];
}

/** Parses and limits the CSV upload before domain analysis begins. */
export class ImportCsvParser {
  constructor(private readonly handlers: ImportCsvParserHandlers) {}

  parse(
    files: Partial<Record<ImportFileType, ImportUploadFile>>,
  ): ParsedImportFiles {
    const payload: ImportPayload = {
      providedFiles: [],
      accounts: [],
      categories: [],
      assets: [],
      transactions: [],
      recurringRules: [],
      recurringExceptions: [],
      budgets: [],
      budgetOverrides: [],
      expenseCategoryHierarchy: [],
      expenseValidationRules: [],
    };
    const issues: ImportRowIssueResponse[] = [];
    let totalRows = 0;

    for (const fileType of Object.keys(files) as ImportFileType[]) {
      const file = files[fileType];
      if (!file) {
        continue;
      }

      payload.providedFiles.push(fileType);

      if (file.buffer.length > MAX_UPLOAD_FILE_BYTES) {
        issues.push(
          this.handlers.issue(
            fileType,
            1,
            null,
            `${fileType}.csv exceeds the 1 MB size limit.`,
          ),
        );
        continue;
      }

      let records: CsvRecordRow[];
      try {
        records = this.parseCsvFile(fileType, file.buffer.toString('utf8'));
      } catch (error) {
        issues.push(
          this.handlers.issue(
            fileType,
            1,
            null,
            this.handlers.describeError(error),
          ),
        );
        continue;
      }

      if (records.length > MAX_IMPORT_ROWS_PER_FILE) {
        issues.push(
          this.handlers.issue(
            fileType,
            1,
            null,
            `${fileType}.csv has ${records.length} rows, which exceeds the ${MAX_IMPORT_ROWS_PER_FILE} row limit per file.`,
          ),
        );
        continue;
      }

      if (totalRows + records.length > MAX_IMPORT_TOTAL_ROWS) {
        issues.push(
          this.handlers.issue(
            fileType,
            1,
            null,
            `The CSV import has more than ${MAX_IMPORT_TOTAL_ROWS} rows across all files.`,
          ),
        );
        continue;
      }

      totalRows += records.length;
      const parser = this.handlers.rowParsers[fileType];
      if (!parser) {
        continue;
      }

      const parsedRows = this.parseRows(fileType, records, issues, parser);
      switch (fileType) {
        case 'accounts':
          payload.accounts = parsedRows as ImportPayload['accounts'];
          break;
        case 'categories':
          payload.categories = parsedRows as ImportPayload['categories'];
          break;
        case 'assets':
          payload.assets = parsedRows as ImportPayload['assets'];
          break;
        case 'transactions':
          payload.transactions = parsedRows as ImportPayload['transactions'];
          break;
        case 'recurringRules':
          payload.recurringRules =
            parsedRows as ImportPayload['recurringRules'];
          break;
        case 'recurringExceptions':
          payload.recurringExceptions =
            parsedRows as ImportPayload['recurringExceptions'];
          break;
        case 'budgets':
          payload.budgets = parsedRows as ImportPayload['budgets'];
          break;
        case 'budgetOverrides':
          payload.budgetOverrides =
            parsedRows as ImportPayload['budgetOverrides'];
          break;
        case 'expenseCategoryHierarchy':
          payload.expenseCategoryHierarchy =
            parsedRows as ImportPayload['expenseCategoryHierarchy'];
          break;
        case 'expenseValidationRules':
          payload.expenseValidationRules =
            parsedRows as ImportPayload['expenseValidationRules'];
          break;
      }
    }

    if (payload.providedFiles.length === 0) {
      throw new BadRequestException('Upload at least one CSV file to preview.');
    }

    return { payload, issues };
  }

  private parseRows(
    file: ImportFileType,
    records: CsvRecordRow[],
    issues: ImportRowIssueResponse[],
    parser: RowParser,
  ): unknown[] {
    const rows: unknown[] = [];

    for (const record of records) {
      try {
        rows.push(parser(record.rowNumber, record.values));
      } catch (error) {
        issues.push(
          this.handlers.issue(
            file,
            record.rowNumber,
            null,
            this.handlers.describeError(error),
          ),
        );
      }
    }

    return rows;
  }

  private parseCsvFile(file: ImportFileType, rawText: string): CsvRecordRow[] {
    const { headers, rows } = parseCsvTable(rawText, {
      emptyMessage: `${file}.csv is empty.`,
    });
    const expectedHeaders = [...IMPORT_TEMPLATE_HEADERS[file]];
    const optionalHeaders = IMPORT_TEMPLATE_OPTIONAL_HEADERS[file] ?? [];
    const unknownHeaders = headers.filter(
      (header) => !expectedHeaders.includes(header),
    );
    const missingHeaders = expectedHeaders.filter(
      (header) =>
        !headers.includes(header) && !optionalHeaders.includes(header),
    );

    if (unknownHeaders.length > 0 || missingHeaders.length > 0) {
      const parts: string[] = [];

      if (unknownHeaders.length > 0) {
        parts.push(`Unknown headers: ${unknownHeaders.join(', ')}.`);
      }

      if (missingHeaders.length > 0) {
        parts.push(`Missing headers: ${missingHeaders.join(', ')}.`);
      }

      throw new BadRequestException(
        `${file}.csv does not match the finhance template. ${parts.join(' ')}`,
      );
    }

    return rows;
  }
}
