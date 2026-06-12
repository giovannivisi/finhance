import { PartialType } from '@nestjs/mapped-types';
import { CreateExpenseValidationRuleDto } from '@transactions/dto/create-expense-validation-rule.dto';

export class UpdateExpenseValidationRuleDto extends PartialType(
  CreateExpenseValidationRuleDto,
) {}
