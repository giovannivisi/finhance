import {
  isAllowedCorsOrigin,
  parseAllowedOrigins,
  parseTrustProxy,
  resolveBootstrapRuntimeConfig,
} from '@/config/bootstrap.config';

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEaomm0l20o+4bzZLBKT9Q4hqtjsRR
b1j86cNrWoAY2tPRUiANQweYphsPxMOAeBRARgh6/eDup2Mkv45IzNGcsQ==
-----END PUBLIC KEY-----`;

describe('bootstrap config', () => {
  it('uses loopback defaults when env is unset', () => {
    expect(resolveBootstrapRuntimeConfig({})).toEqual({
      authMode: 'local',
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
      }),
    ).toThrow(
      'Refusing to bind API_HOST=0.0.0.0 while authentication is disabled.',
    );
  });

  it('requires explicit origins and JWT settings in hosted mode', () => {
    expect(() =>
      resolveBootstrapRuntimeConfig({
        AUTH_MODE: 'hosted',
      }),
    ).toThrow('API_HOST must be configured in hosted auth mode.');
  });

  it('allows non-loopback hosts in hosted mode with explicit config', () => {
    expect(
      resolveBootstrapRuntimeConfig({
        AUTH_MODE: 'hosted',
        API_HOST: '0.0.0.0',
        API_ALLOWED_ORIGINS: 'https://finhance.example',
        API_TRUST_PROXY: '1',
        AUTH_API_JWT_ISSUER: 'https://web.example',
        AUTH_API_JWT_AUDIENCE: 'finhance-api',
        AUTH_API_JWT_KID: 'test-key',
        AUTH_API_JWT_PUBLIC_KEY: TEST_PUBLIC_KEY,
      }),
    ).toEqual({
      authMode: 'hosted',
      host: '0.0.0.0',
      allowedOrigins: ['https://finhance.example'],
      trustProxy: 1,
    });
  });

  it('requires explicit trust proxy settings in hosted mode', () => {
    expect(() =>
      resolveBootstrapRuntimeConfig({
        AUTH_MODE: 'hosted',
        API_HOST: '127.0.0.1',
        API_ALLOWED_ORIGINS: 'http://localhost:3001',
        AUTH_API_JWT_ISSUER: 'https://web.example',
        AUTH_API_JWT_AUDIENCE: 'finhance-api',
        AUTH_API_JWT_KID: 'test-key',
        AUTH_API_JWT_PUBLIC_KEY: TEST_PUBLIC_KEY,
      }),
    ).toThrow('API_TRUST_PROXY must be configured in hosted auth mode.');
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
