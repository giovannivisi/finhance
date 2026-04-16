import {
  isAllowedCorsOrigin,
  parseAllowedOrigins,
  resolveBootstrapRuntimeConfig,
} from '@/config/bootstrap.config';

describe('bootstrap config', () => {
  it('uses loopback defaults when env is unset', () => {
    expect(resolveBootstrapRuntimeConfig({} as NodeJS.ProcessEnv)).toEqual({
      host: '127.0.0.1',
      allowedOrigins: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    });
  });

  it('parses explicit allowed origins and matches them exactly', () => {
    const allowedOrigins = parseAllowedOrigins(
      'http://localhost:3001, http://127.0.0.1:3001',
    );

    expect(isAllowedCorsOrigin('http://localhost:3001', allowedOrigins)).toBe(
      true,
    );
    expect(isAllowedCorsOrigin('http://evil.example', allowedOrigins)).toBe(
      false,
    );
  });

  it('rejects wildcard origins', () => {
    expect(() => parseAllowedOrigins('http://localhost:3001,*')).toThrow(
      'API_ALLOWED_ORIGINS does not support wildcard origins.',
    );
  });

  it('rejects non-loopback hosts without explicit opt-in', () => {
    expect(() =>
      resolveBootstrapRuntimeConfig({
        API_HOST: '0.0.0.0',
      } as NodeJS.ProcessEnv),
    ).toThrow(
      'Refusing to bind API_HOST=0.0.0.0 without ALLOW_NON_LOOPBACK=true.',
    );
  });
});
