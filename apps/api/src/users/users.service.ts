import { Injectable } from '@nestjs/common';
import { Prisma } from '@finhance/db';
import type {
  UpdateUserSettingsRequest,
  UserSettingsResponse,
} from '@finhance/shared';
import { PrismaService } from '@prisma/prisma.service';
import {
  isUserStartPage,
  normalizeUserSettings,
} from '@/users/users.settings';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(ownerId: string): Promise<UserSettingsResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { userSettings: true },
    });

    return normalizeUserSettings(toUserSettingsRecord(user.userSettings));
  }

  async updateSettings(
    ownerId: string,
    input: UpdateUserSettingsRequest,
  ): Promise<UserSettingsResponse> {
    const existing = await this.getSettings(ownerId);
    const next = normalizeUserSettings({
      ...existing,
      ...input,
    });

    const user = await this.prisma.user.update({
      where: { id: ownerId },
      data: {
        userSettings: next as unknown as Prisma.InputJsonValue,
      },
      select: {
        userSettings: true,
      },
    });

    return normalizeUserSettings(toUserSettingsRecord(user.userSettings));
  }
}

function toUserSettingsRecord(
  value: Prisma.JsonValue | null,
): Partial<UserSettingsResponse> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return {
    showTransactionTimes:
      typeof candidate.showTransactionTimes === 'boolean'
        ? candidate.showTransactionTimes
        : undefined,
    startPage:
      isUserStartPage(candidate.startPage) ? candidate.startPage : undefined,
  };
}
