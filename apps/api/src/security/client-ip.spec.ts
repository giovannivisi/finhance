import { isLoopbackIp, resolveClientIp } from '@/security/client-ip';

describe('resolveClientIp', () => {
  it('prefers the first trusted proxy address when present', () => {
    expect(
      resolveClientIp({
        ips: ['203.0.113.10', '10.0.0.5'],
        ip: '10.0.0.5',
      }),
    ).toBe('203.0.113.10');
  });

  it('falls back to req.ip when the proxy chain is unavailable', () => {
    expect(
      resolveClientIp({
        ip: '198.51.100.8',
      }),
    ).toBe('198.51.100.8');
  });

  it('falls back to the socket remote address as a last resort', () => {
    expect(
      resolveClientIp({
        socket: {
          remoteAddress: '192.0.2.55',
        },
      }),
    ).toBe('192.0.2.55');
  });

  it('ignores raw x-forwarded-for when req.ip is available', () => {
    expect(
      resolveClientIp({
        ip: '127.0.0.1',
      }),
    ).toBe('127.0.0.1');
  });

  it('detects supported loopback address formats', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackIp('198.51.100.10')).toBe(false);
  });
});
