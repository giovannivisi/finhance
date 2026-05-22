import {
  getSupportedCurrencyDefinitions,
  SUPPORTED_REPORTING_CURRENCY_CODES,
  type CurrencyDefinition,
} from "@finhance/shared/currencies";
import {
  getSupportedExchangeDefinitionsForKind,
  type ExchangeDefinition,
} from "@finhance/shared/exchanges";
import type { AssetKind } from "@finhance/shared/assets";

export interface PickerOption {
  value: string;
  label: string;
  searchText: string;
  badge?: string;
  prefix?: string;
  meta?: string;
}

function toCurrencyOption(definition: CurrencyDefinition): PickerOption {
  return {
    value: definition.code,
    label: definition.name,
    searchText: definition.searchText,
    badge: definition.code,
  };
}

function toExchangeOption(definition: ExchangeDefinition): PickerOption {
  return {
    value: definition.value,
    label: definition.name,
    searchText: definition.searchText,
    prefix: definition.flag,
    meta: definition.venue,
  };
}

export function getCurrencyPickerOptions(): PickerOption[] {
  return getSupportedCurrencyDefinitions().map(toCurrencyOption);
}

export function getReportingCurrencyPickerOptions(): PickerOption[] {
  const supported = new Set<string>(SUPPORTED_REPORTING_CURRENCY_CODES);
  return getSupportedCurrencyDefinitions()
    .filter((definition) => supported.has(definition.code))
    .map(toCurrencyOption);
}

export function getExchangePickerOptionsForKind(
  kind: AssetKind,
): PickerOption[] {
  return getSupportedExchangeDefinitionsForKind(kind).map(toExchangeOption);
}
