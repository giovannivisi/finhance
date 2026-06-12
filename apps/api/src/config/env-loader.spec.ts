import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getApiEnvPath, loadApiEnv } from '@/config/env-loader';

describe('env-loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'finhance-env-loader-'));
  });

  afterEach(() => {
    delete process.env.API_ALLOWED_ORIGINS;
    delete process.env.API_TRUST_PROXY;
    delete process.env.FINHANCE_TEST_ONLY;
    delete process.env.AUTH_API_JWT_PUBLIC_KEY;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when no application-owned env file exists', () => {
    expect(getApiEnvPath([join(tempDir, '.env')])).toBeNull();
  });

  it('selects the first existing application-owned env file', () => {
    const preferredPath = join(tempDir, 'preferred.env');
    const fallbackPath = join(tempDir, 'fallback.env');

    writeFileSync(fallbackPath, 'FINHANCE_TEST_ONLY=fallback\n', 'utf8');
    writeFileSync(preferredPath, 'FINHANCE_TEST_ONLY=preferred\n', 'utf8');

    expect(getApiEnvPath([preferredPath, fallbackPath])).toBe(preferredPath);
  });

  it('loads only the provided application-owned env paths', () => {
    const cwdLikeEnvPath = join(tempDir, 'cwd.env');
    const apiOwnedEnvPath = join(tempDir, 'apps-api.env');

    writeFileSync(
      cwdLikeEnvPath,
      'API_ALLOWED_ORIGINS=http://evil.example\n',
      'utf8',
    );
    writeFileSync(
      apiOwnedEnvPath,
      'API_ALLOWED_ORIGINS=http://localhost:3001\nAPI_TRUST_PROXY=1\n',
      'utf8',
    );

    loadApiEnv([apiOwnedEnvPath]);

    expect(process.env.API_ALLOWED_ORIGINS).toBe('http://localhost:3001');
    expect(process.env.API_TRUST_PROXY).toBe('1');
  });

  it('does not overwrite existing process env values', () => {
    const apiOwnedEnvPath = join(tempDir, 'apps-api.env');

    process.env.API_ALLOWED_ORIGINS = 'http://localhost:3001';
    writeFileSync(
      apiOwnedEnvPath,
      'API_ALLOWED_ORIGINS=http://127.0.0.1:3001\n',
      'utf8',
    );

    loadApiEnv([apiOwnedEnvPath]);

    expect(process.env.API_ALLOWED_ORIGINS).toBe('http://localhost:3001');
  });

  it('loads quoted multiline env values without truncating them', () => {
    const apiOwnedEnvPath = join(tempDir, 'apps-api.env');

    writeFileSync(
      apiOwnedEnvPath,
      [
        'AUTH_API_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----',
        'line-two',
        '-----END PUBLIC KEY-----"',
        '',
      ].join('\n'),
      'utf8',
    );

    loadApiEnv([apiOwnedEnvPath]);

    expect(process.env.AUTH_API_JWT_PUBLIC_KEY).toBe(
      [
        '-----BEGIN PUBLIC KEY-----',
        'line-two',
        '-----END PUBLIC KEY-----',
      ].join('\n'),
    );
  });
});
