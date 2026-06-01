import { Prisma } from '@finhance/db';

const PLACEHOLDER_EMAIL_DOMAIN = 'placeholder.local';

type OwnerUserClient = {
  user: {
    upsert(args: Prisma.UserUpsertArgs): Promise<unknown>;
  };
};

export function buildOwnerPlaceholderEmail(userId: string): string {
  return `finhance-user+${userId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export async function ensureOwnerUserRecord(
  client: OwnerUserClient,
  input: {
    userId: string;
    email?: string | null;
  },
): Promise<void> {
  const userId = input.userId.trim();

  if (!userId) {
    throw new Error('Owner user id must not be empty.');
  }

  const normalizedEmail =
    normalizeOwnerEmail(input.email) ?? buildOwnerPlaceholderEmail(userId);

  await client.user.upsert({
    where: { id: userId },
    update:
      normalizeOwnerEmail(input.email) === null
        ? {}
        : { email: normalizedEmail },
    create: {
      id: userId,
      email: normalizedEmail,
    },
  });
}

function normalizeOwnerEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized || null;
}
