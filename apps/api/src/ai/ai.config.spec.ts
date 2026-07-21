import {
  DEFAULT_AI_DAILY_LIMIT_GLOBAL,
  DEFAULT_AI_DAILY_LIMIT_PER_USER,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_RATE_LIMIT_PER_MINUTE,
  resolveAiRuntimeConfig,
} from '@/ai/ai.config';

describe('resolveAiRuntimeConfig', () => {
  it('fails closed without a Groq key', () => {
    expect(resolveAiRuntimeConfig({})).toMatchObject({
      cloudParserAvailable: false,
      disabled: false,
      model: DEFAULT_AI_MODEL,
      rateLimitPerMinute: DEFAULT_AI_RATE_LIMIT_PER_MINUTE,
      dailyLimitPerUser: DEFAULT_AI_DAILY_LIMIT_PER_USER,
      dailyLimitGlobal: DEFAULT_AI_DAILY_LIMIT_GLOBAL,
    });
  });

  it('enables cloud parsing only with a key and no kill switch', () => {
    expect(
      resolveAiRuntimeConfig({
        GROQ_API_KEY: 'test-key',
        AI_MODEL: 'openai/gpt-oss-20b',
        AI_RATE_LIMIT_PER_MINUTE: '5',
        AI_DAILY_LIMIT_PER_USER: '12',
        AI_DAILY_LIMIT_GLOBAL: '80',
      }),
    ).toMatchObject({
      cloudParserAvailable: true,
      model: 'openai/gpt-oss-20b',
      rateLimitPerMinute: 5,
      dailyLimitPerUser: 12,
      dailyLimitGlobal: 80,
    });

    expect(
      resolveAiRuntimeConfig({ GROQ_API_KEY: 'test-key', AI_DISABLED: 'true' })
        .cloudParserAvailable,
    ).toBe(false);
  });

  it('rejects unsafe configuration values', () => {
    expect(() =>
      resolveAiRuntimeConfig({ AI_DAILY_LIMIT_GLOBAL: '0' }),
    ).toThrow('AI_DAILY_LIMIT_GLOBAL must be a positive integer.');
    expect(() => resolveAiRuntimeConfig({ AI_DISABLED: 'sometimes' })).toThrow(
      'AI_DISABLED must be "true" or "false" when configured.',
    );
  });
});
