export const AI_CLOUD_PARSER_PROVIDER = 'groq';
export const AI_CLOUD_PARSER_CONSENT_VERSION = '2026-07-12';
export const DEFAULT_AI_MODEL = 'openai/gpt-oss-20b';
export const DEFAULT_AI_RATE_LIMIT_PER_MINUTE = 3;
export const DEFAULT_AI_DAILY_LIMIT_PER_USER = 10;
export const DEFAULT_AI_DAILY_LIMIT_GLOBAL = 100;
export const DEFAULT_AI_INPUT_LIMIT_CHARACTERS = 6_000;
export const DEFAULT_AI_OUTPUT_LIMIT_TOKENS = 1_024;
export const DEFAULT_AI_TIMEOUT_MS = 15_000;

export interface AiRuntimeConfig {
  cloudParserAvailable: boolean;
  disabled: boolean;
  model: string;
  rateLimitPerMinute: number;
  dailyLimitPerUser: number;
  dailyLimitGlobal: number;
  inputLimitCharacters: number;
  outputLimitTokens: number;
  timeoutMs: number;
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  key: string,
): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }

  return parsed;
}

function readDisabled(value: string | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  throw new Error('AI_DISABLED must be "true" or "false" when configured.');
}

export function resolveGroqApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.GROQ_API_KEY?.trim();
  return value || null;
}

export function resolveAiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): AiRuntimeConfig {
  const disabled = readDisabled(env.AI_DISABLED);
  const model = env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;

  return {
    cloudParserAvailable: !disabled && resolveGroqApiKey(env) !== null,
    disabled,
    model,
    rateLimitPerMinute: readPositiveInteger(
      env.AI_RATE_LIMIT_PER_MINUTE,
      DEFAULT_AI_RATE_LIMIT_PER_MINUTE,
      'AI_RATE_LIMIT_PER_MINUTE',
    ),
    dailyLimitPerUser: readPositiveInteger(
      env.AI_DAILY_LIMIT_PER_USER,
      DEFAULT_AI_DAILY_LIMIT_PER_USER,
      'AI_DAILY_LIMIT_PER_USER',
    ),
    dailyLimitGlobal: readPositiveInteger(
      env.AI_DAILY_LIMIT_GLOBAL,
      DEFAULT_AI_DAILY_LIMIT_GLOBAL,
      'AI_DAILY_LIMIT_GLOBAL',
    ),
    inputLimitCharacters: readPositiveInteger(
      env.AI_INPUT_LIMIT_CHARACTERS,
      DEFAULT_AI_INPUT_LIMIT_CHARACTERS,
      'AI_INPUT_LIMIT_CHARACTERS',
    ),
    outputLimitTokens: readPositiveInteger(
      env.AI_OUTPUT_LIMIT_TOKENS,
      DEFAULT_AI_OUTPUT_LIMIT_TOKENS,
      'AI_OUTPUT_LIMIT_TOKENS',
    ),
    timeoutMs: readPositiveInteger(
      env.AI_TIMEOUT_MS,
      DEFAULT_AI_TIMEOUT_MS,
      'AI_TIMEOUT_MS',
    ),
  };
}
