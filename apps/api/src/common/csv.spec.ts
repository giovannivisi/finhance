import { BadRequestException } from '@nestjs/common';
import {
  parseCsvRows,
  parseCsvTable,
  restoreSpreadsheetFormulaPrefix,
  serializeCsv,
} from '@/common/csv';

describe('csv utilities', () => {
  it('parses quoted fields and trims tabular values', () => {
    const table = parseCsvTable(
      'name,notes\r\n  Ada  ,"hello, ""world"""  \r\nBob,plain\r\n',
    );

    expect(table.headers).toEqual(['name', 'notes']);
    expect(table.rows).toEqual([
      {
        rowNumber: 2,
        values: {
          name: 'Ada',
          notes: 'hello, "world"',
        },
      },
      {
        rowNumber: 3,
        values: {
          name: 'Bob',
          notes: 'plain',
        },
      },
    ]);
  });

  it('rejects unterminated quoted fields', () => {
    expect(() => parseCsvRows('name\n"Ada')).toThrow(BadRequestException);
  });

  it('serialises CSV safely for spreadsheets and restores guarded formulas', () => {
    const csv = serializeCsv({
      headers: ['entry', 'notes'],
      rows: [
        {
          entry: '=SUM(A1:A3)',
          notes: 'hello,world',
        },
      ],
      trailingNewline: true,
    });

    expect(csv).toBe('entry,notes\n\'=SUM(A1:A3),"hello,world"\n');
    expect(restoreSpreadsheetFormulaPrefix("'=SUM(A1:A3)")).toBe('=SUM(A1:A3)');
  });
});
