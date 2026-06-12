import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { LocalOnlyImportsGuard } from '@/security/local-only-imports.guard';
import { ExpenseValidationController } from '@transactions/expense-validation.controller';

describe('ExpenseValidationController throttling', () => {
  it.each([
    'importRules',
    'importHierarchy',
    'exportRules',
    'exportHierarchy',
  ] as const)('applies the imports throttle bucket to %s', (methodName) => {
    const handler = ExpenseValidationController.prototype[methodName];

    expect(
      Reflect.getMetadata('THROTTLER:LIMITimports', handler),
    ).toBeDefined();
    expect(Reflect.getMetadata('THROTTLER:TTLimports', handler)).toBeDefined();
  });

  it.each(['importRules', 'importHierarchy'] as const)(
    'applies the local import guard to %s',
    (methodName) => {
      const handler = ExpenseValidationController.prototype[methodName];

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        LocalOnlyImportsGuard,
      );
    },
  );

  it.each([
    ['importRules', 'rules.csv'],
    ['importHierarchy', 'hierarchy.csv'],
  ] as const)(
    'rejects missing multipart files for %s',
    async (methodName, fileName) => {
      const controller = new ExpenseValidationController(
        {
          importRulesCsv: jest.fn(),
          importHierarchyCsv: jest.fn(),
        } as unknown as ConstructorParameters<
          typeof ExpenseValidationController
        >[0],
        {
          resolveOwnerId: () => 'owner-1',
        } as unknown as ConstructorParameters<
          typeof ExpenseValidationController
        >[1],
      );

      await expect(controller[methodName](undefined as never)).rejects.toThrow(
        new BadRequestException(
          `${fileName} upload requires a multipart file field named "file".`,
        ),
      );
    },
  );
});
