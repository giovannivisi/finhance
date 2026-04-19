import {
  isAllowedCorsOrigin,
  parseAllowedOrigins,
  parseTrustProxy,
  resolveBootstrapRuntimeConfig,
} from '@/config/bootstrap.config';

describe('bootstrap config', () => {
  it('uses loopback defaults when env is unset', () => {
    expect(resolveBootstrapRuntimeConfig({} as NodeJS.ProcessEnv)).toEqual({
      host: '127.0.0.1',
      allowedOrigins: ['http://localhost:3001', 'http://127.0.0.1:3001'],
      trustProxy: false,
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

  it('rejects non-loopback hosts while authentication is disabled', () => {
    expect(() =>
      resolveBootstrapRuntimeConfig({
        API_HOST: '0.0.0.0',
      } as NodeJS.ProcessEnv),
    ).toThrow(
      'Refusing to bind API_HOST=0.0.0.0 while authentication is disabled.',
    );
  });

  it('parses trust proxy settings for proxied deployments', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy(undefined)).toBe(false);
  });

  it('rejects invalid trust proxy settings', () => {
    expect(() => parseTrustProxy('0')).toThrow(
      'API_TRUST_PROXY must be "true", "false", or a positive integer.',
    );
    expect(() => parseTrustProxy('maybe')).toThrow(
      'API_TRUST_PROXY must be "true", "false", or a positive integer.',
    );
  });
});
