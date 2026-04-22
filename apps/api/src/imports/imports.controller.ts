import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { LocalOnlyImportsGuard } from '@/security/local-only-imports.guard';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { ImportsService } from '@imports/imports.service';
import type {
  ImportBatchResponse,
  ImportPreviewResponse,
} from '@finhance/shared';
import type { ImportFileType } from '@finhance/shared';
import type { ImportUploadFile } from '@imports/imports.types';

type UploadedImportFiles = Partial<
  Record<ImportFileType, Array<{ originalname: string; buffer: Buffer }>>
>;

const MAX_IMPORT_UPLOAD_FILE_BYTES = 1024 * 1024;
const MAX_IMPORT_UPLOAD_FILES = 4;

@Controller('imports')
@UseGuards(LocalOnlyImportsGuard)
export class ImportsController {
  constructor(
    private readonly importsService: ImportsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Post('csv/preview')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'accounts', maxCount: 1 },
        { name: 'categories', maxCount: 1 },
        { name: 'assets', maxCount: 1 },
        { name: 'transactions', maxCount: 1 },
      ],
      {
        limits: {
          fileSize: MAX_IMPORT_UPLOAD_FILE_BYTES,
          files: MAX_IMPORT_UPLOAD_FILES,
        },
      },
    ),
  )
  async preview(
    @UploadedFiles() files: UploadedImportFiles,
  ): Promise<ImportPreviewResponse> {
    return this.importsService.previewCsv(
      this.resolveOwnerId(),
      this.toUploadMap(files ?? {}),
    );
  }

  @Post('csv/export')
  @HttpCode(200)
  async export(@Res() response: Response): Promise<void> {
    const result = await this.importsService.exportCsvZip(
      this.resolveOwnerId(),
    );
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    response.send(result.buffer);
  }

  @Post(':batchId/apply')
  async apply(@Param('batchId') batchId: string): Promise<ImportBatchResponse> {
    return this.importsService.applyBatch(this.resolveOwnerId(), batchId);
  }

  @Get()
  async list(): Promise<ImportBatchResponse[]> {
    return this.importsService.listRecent(this.resolveOwnerId());
  }

  @Get(':batchId')
  async findOne(
    @Param('batchId') batchId: string,
  ): Promise<ImportBatchResponse> {
    return this.importsService.findOne(this.resolveOwnerId(), batchId);
  }

  private toUploadMap(
    files: UploadedImportFiles,
  ): Partial<Record<ImportFileType, ImportUploadFile>> {
    const result: Partial<Record<ImportFileType, ImportUploadFile>> = {};

    for (const key of Object.keys(files) as ImportFileType[]) {
      const file = files[key]?.[0];
      if (!file) {
        continue;
      }

      result[key] = {
        originalName: file.originalname,
        buffer: file.buffer,
      };
    }

    return result;
  }
}
