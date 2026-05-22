import {
  isSupportedCurrencyCode,
  isSupportedReportingCurrencyCode,
  isSupportedExchangeValue,
} from '@/common/catalogues';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import type { AssetKind } from '@finhance/shared';

export function IsSupportedCurrencyCode(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSupportedCurrencyCode',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && isSupportedCurrencyCode(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a supported 3-letter currency code.`;
        },
      },
    });
  };
}

export function IsSupportedReportingCurrencyCode(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSupportedReportingCurrencyCode',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'string' && isSupportedReportingCurrencyCode(value)
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be one of the supported reporting currencies.`;
        },
      },
    });
  };
}

export function IsSupportedExchangeValue(
  resolveKind?: (object: unknown) => AssetKind | null | undefined,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSupportedExchangeValue',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }

          const kind = resolveKind?.(args.object);
          return isSupportedExchangeValue(value, kind);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a supported exchange.`;
        },
      },
    });
  };
}
