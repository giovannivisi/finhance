import { Injectable } from '@nestjs/common';
import {
  AiUsageEventStatus,
  CloudParserConsentAction,
  Prisma,
} from '@finhance/db';
import {
  AI_CLOUD_PARSER_CONSENT_VERSION,
  AI_CLOUD_PARSER_PROVIDER,
} from '@/ai/ai.config';
import { AiConfigurationService } from '@/ai/ai-configuration.service';
import { PrismaService } from '@prisma/prisma.service';
import { romeDateToUtcStart } from '@transactions/transactions.dates';

const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export class AiCloudParserUnavailableError extends Error {
  constructor() {
    super('Cloud parsing is not available in this deployment.');
  }
}

export class AiDailyLimitExceededError extends Error {
  constructor(readonly scope: 'user' | 'global') {
    super(
      scope === 'user'
        ? 'The daily cloud parsing limit has been reached for this account.'
        : 'The daily cloud parsing limit has been reached for this deployment.',
    );
  }
}

export interface AiUsageReservation {
  id: string;
  model: string;
}

@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuration: AiConfigurationService,
  ) {}

  async reserveCloudParse(
    userId: string,
    endpoint: string,
    now = new Date(),
  ): Promise<AiUsageReservation> {
    const config = this.configuration.runtimeConfig;

    if (!config.cloudParserAvailable) {
      throw new AiCloudParserUnavailableError();
    }

    const dayStart = romeDateToUtcStart(ROME_DATE_FORMATTER.format(now));

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const [userCount, globalCount] = await Promise.all([
              tx.aiUsageEvent.count({
                where: { userId, createdAt: { gte: dayStart } },
              }),
              tx.aiUsageEvent.count({
                where: { createdAt: { gte: dayStart } },
              }),
            ]);

            if (userCount >= config.dailyLimitPerUser) {
              throw new AiDailyLimitExceededError('user');
            }

            if (globalCount >= config.dailyLimitGlobal) {
              throw new AiDailyLimitExceededError('global');
            }

            const reservation = await tx.aiUsageEvent.create({
              data: {
                userId,
                endpoint,
                provider: AI_CLOUD_PARSER_PROVIDER,
                model: config.model,
                status: AiUsageEventStatus.RESERVED,
              },
              select: { id: true, model: true },
            });

            return reservation;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < MAX_SERIALIZABLE_ATTEMPTS
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new Error('Unable to reserve cloud parsing quota.');
  }

  async markCompleted(
    id: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    await this.prisma.aiUsageEvent.update({
      where: { id },
      data: {
        inputTokens: toTokenCount(inputTokens),
        outputTokens: toTokenCount(outputTokens),
        status: AiUsageEventStatus.COMPLETED,
      },
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.aiUsageEvent.update({
      where: { id },
      data: { status: AiUsageEventStatus.FAILED },
    });
  }

  async hasActiveCloudParserConsent(userId: string): Promise<boolean> {
    const latest = await this.prisma.cloudParserConsentEvent.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { action: true, noticeVersion: true },
    });

    return (
      latest?.action === CloudParserConsentAction.GRANTED &&
      latest.noticeVersion === AI_CLOUD_PARSER_CONSENT_VERSION
    );
  }
}

function toTokenCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Token counts must be non-negative integers.');
  }

  return value;
}
