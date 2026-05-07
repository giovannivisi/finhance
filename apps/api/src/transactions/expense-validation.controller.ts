import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createNamedThrottleOverride } from '@/config/throttle.config';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import type { ExpenseValidationRuleResponse } from '@finhance/shared';
import { toExpenseValidationRuleResponse } from '@transactions/expense-validation.mapper';
import { ExpenseValidationService } from '@transactions/expense-validation.service';
import { CreateExpenseValidationRuleDto } from '@transactions/dto/create-expense-validation-rule.dto';
import { UpdateExpenseValidationRuleDto } from '@transactions/dto/update-expense-validation-rule.dto';

const MAX_CSV_BYTES = 1024 * 1024;
type UploadedCsvFile = { buffer: Buffer };

@Controller('expense-validation')
export class ExpenseValidationController {
  constructor(
    private readonly expenseValidationService: ExpenseValidationService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  private requireUploadedFile(
    file: UploadedCsvFile | undefined,
    fileName: string,
  ): UploadedCsvFile {
    if (!file?.buffer) {
      throw new BadRequestException(
        `${fileName} upload requires a multipart file field named "file".`,
      );
    }

    return file;
  }

  @Get()
  async list(): Promise<ExpenseValidationRuleResponse[]> {
    const rules = await this.expenseValidationService.list(
      this.resolveOwnerId(),
    );
    return rules.map(toExpenseValidationRuleResponse);
  }

  @Post()
  async create(
    @Body() dto: CreateExpenseValidationRuleDto,
  ): Promise<ExpenseValidationRuleResponse> {
    const rule = await this.expenseValidationService.create(
      this.resolveOwnerId(),
      dto,
    );
    return toExpenseValidationRuleResponse(rule);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExpenseValidationRuleDto,
  ): Promise<ExpenseValidationRuleResponse> {
    const rule = await this.expenseValidationService.update(
      this.resolveOwnerId(),
      id,
      dto,
    );
    return toExpenseValidationRuleResponse(rule);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    return this.expenseValidationService.remove(this.resolveOwnerId(), id);
  }

  @Post('rules/import')
  @Throttle(createNamedThrottleOverride('imports'))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_CSV_BYTES,
      },
    }),
  )
  async importRules(
    @UploadedFile() file?: UploadedCsvFile,
  ): Promise<{ createdCount: number; updatedCount: number }> {
    return this.expenseValidationService.importRulesCsv(
      this.resolveOwnerId(),
      this.requireUploadedFile(file, 'rules.csv'),
    );
  }

  @Post('hierarchy/import')
  @Throttle(createNamedThrottleOverride('imports'))
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_CSV_BYTES,
      },
    }),
  )
  async importHierarchy(
    @UploadedFile() file?: UploadedCsvFile,
  ): Promise<{ createdCount: number; updatedCount: number }> {
    return this.expenseValidationService.importHierarchyCsv(
      this.resolveOwnerId(),
      this.requireUploadedFile(file, 'hierarchy.csv'),
    );
  }

  @Post('rules/export')
  @HttpCode(200)
  @Throttle(createNamedThrottleOverride('imports'))
  async exportRules(@Res() response: Response): Promise<void> {
    const csv = await this.expenseValidationService.exportRulesCsv(
      this.resolveOwnerId(),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="expense-validation-rules.csv"',
    );
    response.send(csv);
  }

  @Post('hierarchy/export')
  @HttpCode(200)
  @Throttle(createNamedThrottleOverride('imports'))
  async exportHierarchy(@Res() response: Response): Promise<void> {
    const csv = await this.expenseValidationService.exportHierarchyCsv(
      this.resolveOwnerId(),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="expense-categories-hierarchy.csv"',
    );
    response.send(csv);
  }
}
