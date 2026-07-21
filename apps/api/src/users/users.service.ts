import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudParserConsentAction, Prisma } from '@finhance/db';
import type {
  UpdateUserSettingsRequest,
  UserSettings,
  UserSettingsResponse,
} from '@finhance/shared';
import {
  AI_CLOUD_PARSER_CONSENT_VERSION,
  AI_CLOUD_PARSER_PROVIDER,
  resolveAiRuntimeConfig,
} from '@/ai/ai.config';
import { isSupportedReportingCurrencyCode } from '@/common/catalogues';
import { PrismaService } from '@prisma/prisma.service';
import { buildOwnerPlaceholderEmail } from '@/security/owner-user';
import { isUserStartPage, normalizeUserSettings } from '@/users/users.settings';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(ownerId: string): Promise<UserSettingsResponse> {
    const [settings, latestConsent] = await Promise.all([
      this.getPersistedSettings(ownerId),
      this.getLatestCloudParserConsent(ownerId),
    ]);

    return this.toSettingsResponse(
      settings,
      settings.cloudParserEnabled &&
        hasCurrentCloudParserConsent(latestConsent),
    );
  }

  async updateSettings(
    ownerId: string,
    input: UpdateUserSettingsRequest,
  ): Promise<UserSettingsResponse> {
    const runtimeConfig = resolveAiRuntimeConfig();

    const result = await this.prisma.$transaction(
      async (tx) => {
        const [currentUser, latestConsent] = await Promise.all([
          tx.user.findUnique({
            where: { id: ownerId },
            select: { userSettings: true },
          }),
          tx.cloudParserConsentEvent.findFirst({
            where: { userId: ownerId },
            orderBy: { createdAt: 'desc' },
            select: { action: true, noticeVersion: true },
          }),
        ]);
        const existing = normalizeUserSettings(
          toUserSettingsRecord(currentUser?.userSettings ?? null),
        );
        const next = normalizeUserSettings({
          ...existing,
          ...input,
        });
        const consentActive = hasCurrentCloudParserConsent(latestConsent);
        const shouldGrantConsent =
          input.cloudParserEnabled === true &&
          next.cloudParserEnabled &&
          !consentActive;
        const shouldWithdrawConsent =
          input.cloudParserEnabled === false &&
          !next.cloudParserEnabled &&
          (existing.cloudParserEnabled ||
            latestConsent?.action === CloudParserConsentAction.GRANTED);

        if (shouldGrantConsent) {
          if (!runtimeConfig.cloudParserAvailable) {
            throw new BadRequestException(
              'Cloud parsing is not available in this deployment.',
            );
          }

          if (
            input.cloudParserConsentVersion !== AI_CLOUD_PARSER_CONSENT_VERSION
          ) {
            throw new BadRequestException(
              'The current cloud parsing consent must be confirmed before enabling it.',
            );
          }
        }

        const user = await tx.user.upsert({
          where: { id: ownerId },
          update: {
            userSettings: next as unknown as Prisma.InputJsonValue,
          },
          create: {
            id: ownerId,
            email: buildOwnerPlaceholderEmail(ownerId),
            userSettings: next as unknown as Prisma.InputJsonValue,
          },
          select: {
            id: true,
            userSettings: true,
          },
        });

        if (shouldGrantConsent || shouldWithdrawConsent) {
          await tx.cloudParserConsentEvent.create({
            data: {
              userId: user.id,
              action: shouldGrantConsent
                ? CloudParserConsentAction.GRANTED
                : CloudParserConsentAction.WITHDRAWN,
              noticeVersion: AI_CLOUD_PARSER_CONSENT_VERSION,
              provider: AI_CLOUD_PARSER_PROVIDER,
            },
          });
        }

        return {
          settings: normalizeUserSettings(
            toUserSettingsRecord(user.userSettings),
          ),
          consentActive: shouldGrantConsent
            ? true
            : shouldWithdrawConsent
              ? false
              : consentActive,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.toSettingsResponse(result.settings, result.consentActive);
  }

  private async getPersistedSettings(ownerId: string): Promise<UserSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { userSettings: true },
    });

    return normalizeUserSettings(
      toUserSettingsRecord(user?.userSettings ?? null),
    );
  }

  private getLatestCloudParserConsent(ownerId: string) {
    return this.prisma.cloudParserConsentEvent.findFirst({
      where: { userId: ownerId },
      orderBy: { createdAt: 'desc' },
      select: { action: true, noticeVersion: true },
    });
  }

  private toSettingsResponse(
    settings: UserSettings,
    consentActive: boolean,
  ): UserSettingsResponse {
    const runtimeConfig = resolveAiRuntimeConfig();

    return {
      ...settings,
      cloudParserAvailable: runtimeConfig.cloudParserAvailable,
      cloudParserConsentActive: consentActive,
      cloudParserConsentVersion: runtimeConfig.cloudParserAvailable
        ? AI_CLOUD_PARSER_CONSENT_VERSION
        : null,
    };
  }

  async deleteAccount(
    ownerId: string,
    confirmationEmail: string,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: ownerId },
          select: { email: true },
        });

        if (!user) {
          throw new NotFoundException('User account not found.');
        }

        if (confirmationEmail !== user.email) {
          throw new BadRequestException('Confirmation email does not match.');
        }

        await tx.brokerageOperation.deleteMany({ where: { userId: ownerId } });
        await tx.transaction.deleteMany({ where: { userId: ownerId } });
        await tx.recurringTransactionOccurrence.deleteMany({
          where: { userId: ownerId },
        });
        await tx.recurringTransactionRule.deleteMany({
          where: { userId: ownerId },
        });
        await tx.categoryBudgetOverride.deleteMany({
          where: { userId: ownerId },
        });
        await tx.categoryBudget.deleteMany({ where: { userId: ownerId } });
        await tx.expenseValidationRule.deleteMany({
          where: { userId: ownerId },
        });
        await tx.asset.deleteMany({ where: { userId: ownerId } });
        await tx.account.deleteMany({ where: { userId: ownerId } });
        await tx.category.deleteMany({ where: { userId: ownerId } });
        await tx.netWorthSnapshot.deleteMany({ where: { userId: ownerId } });
        await tx.importBatch.deleteMany({ where: { userId: ownerId } });
        await tx.fxRate.deleteMany({ where: { userId: ownerId } });
        await tx.portfolioAssetKindTarget.deleteMany({
          where: { userId: ownerId },
        });
        await tx.portfolioSecurityTarget.deleteMany({
          where: { userId: ownerId },
        });
        await tx.portfolioState.deleteMany({ where: { userId: ownerId } });
        await tx.aiUsageEvent.deleteMany({ where: { userId: ownerId } });
        await tx.cloudParserConsentEvent.deleteMany({
          where: { userId: ownerId },
        });
        await tx.idempotencyRequest.deleteMany({ where: { userId: ownerId } });
        await tx.operationState.deleteMany({ where: { userId: ownerId } });
        await tx.authVerificationToken.deleteMany({
          where: { identifier: user.email },
        });
        await tx.user.delete({ where: { id: ownerId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function hasCurrentCloudParserConsent(
  consent: {
    action: CloudParserConsentAction;
    noticeVersion: string;
  } | null,
): boolean {
  return (
    consent?.action === CloudParserConsentAction.GRANTED &&
    consent.noticeVersion === AI_CLOUD_PARSER_CONSENT_VERSION
  );
}

function toUserSettingsRecord(
  value: Prisma.JsonValue | null,
): Partial<UserSettings> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return {
    showTransactionTimes:
      typeof candidate.showTransactionTimes === 'boolean'
        ? candidate.showTransactionTimes
        : undefined,
    startPage: isUserStartPage(candidate.startPage)
      ? candidate.startPage
      : undefined,
    reportingCurrency:
      typeof candidate.reportingCurrency === 'string' &&
      isSupportedReportingCurrencyCode(candidate.reportingCurrency)
        ? candidate.reportingCurrency.trim().toUpperCase()
        : undefined,
    cloudParserEnabled:
      typeof candidate.cloudParserEnabled === 'boolean'
        ? candidate.cloudParserEnabled
        : undefined,
  };
}
