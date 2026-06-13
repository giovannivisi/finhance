import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import type { BrokeragePerformanceRange } from '@finhance/shared';

export const BROKERAGE_PERFORMANCE_RANGES: BrokeragePerformanceRange[] = [
  '1D',
  '1W',
  '1M',
  '1Y',
  'MAX',
];

function trimOptionalStringValue({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

export class BrokeragePerformanceQueryDto {
  @IsOptional()
  @Transform(trimOptionalStringValue)
  @IsIn(BROKERAGE_PERFORMANCE_RANGES)
  range?: BrokeragePerformanceRange;
}
