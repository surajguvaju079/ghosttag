import { ConfigService } from '@nestjs/config';
import { networkKey, RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  let now: number;
  beforeEach(() => {
    now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());
  function limiter(overrides: Record<string, number> = {}) {
    return new RateLimitService(
      new ConfigService({
        SAFETY_ROOM_JOIN_WINDOW_MS: 100,
        SAFETY_ROOM_JOIN_IDENTITY_LIMIT: 2,
        SAFETY_ROOM_JOIN_NETWORK_LIMIT: 3,
        ...overrides,
      }),
    );
  }
  it('enforces identity limits across networks, then resets exactly at the boundary', () => {
    const rates = limiter();
    rates.consume('ROOM_JOIN', 'identity', '127.0.0.1');
    rates.consume('ROOM_JOIN', 'identity', '127.0.0.2');
    let failure: unknown;
    try {
      rates.consume('ROOM_JOIN', 'identity', '127.0.0.3');
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      response: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        retryAfterMs: 100,
      },
      status: 429,
    });
    now += 99;
    expect(() => rates.consume('ROOM_JOIN', 'identity')).toThrow();
    now++;
    expect(() => rates.consume('ROOM_JOIN', 'identity')).not.toThrow();
  });
  it('enforces network limits despite rotating identities', () => {
    const rates = limiter();
    for (let i = 0; i < 3; i++)
      rates.consume('ROOM_JOIN', `identity-${i}`, '127.0.0.1');
    expect(() =>
      rates.consume('ROOM_JOIN', 'another', '::ffff:127.0.0.1'),
    ).toThrow();
  });
  it('does not spend another dimension when an atomic multi-limit check fails', () => {
    const rates = limiter({ SAFETY_ROOM_JOIN_NETWORK_LIMIT: 1 });
    rates.consume('ROOM_JOIN', 'a', '127.0.0.1');
    expect(() => rates.consume('ROOM_JOIN', 'b', '127.0.0.1')).toThrow();
    rates.consume('ROOM_JOIN', 'b', '127.0.0.2');
    rates.consume('ROOM_JOIN', 'b', '127.0.0.3');
  });
  it('fails closed at bounded memory capacity and recovers when entries expire', () => {
    const rates = limiter({
      SAFETY_MAX_BUCKETS: 1,
      SAFETY_IDENTITY_CREATE_WINDOW_MS: 100,
    });
    rates.consume('IDENTITY_CREATE', undefined, '127.0.0.1');
    expect(() =>
      rates.consume('IDENTITY_CREATE', undefined, '127.0.0.2'),
    ).toThrow();
    now += 100;
    expect(() =>
      rates.consume('IDENTITY_CREATE', undefined, '127.0.0.2'),
    ).not.toThrow();
    const buckets = (rates as unknown as { buckets: Map<string, unknown> })
      .buckets;
    expect(buckets.size).toBe(1);
    expect([...buckets.keys()][0]).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([0, -1, 'bad', Infinity, true])(
    'rejects unsafe configuration (%p)',
    (value) => {
      expect(
        () =>
          new RateLimitService(
            new ConfigService({ SAFETY_MAX_BUCKETS: value }),
          ),
      ).toThrow();
    },
  );
  it.each([
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['::ffff:7f00:1', '127.0.0.1'],
    ['2001:db8:abcd:1234::1', '2001:0db8:abcd:1234::/64'],
    ['2001:0db8:abcd:1234:0000:0000:0000:ffff', '2001:0db8:abcd:1234::/64'],
    ['::1', '0000:0000:0000:0000::/64'],
    [undefined, 'unknown'],
    ['forged', 'unknown'],
  ])('canonicalizes network peers (%s)', (peer, expected) =>
    expect(networkKey(peer)).toBe(expected),
  );
});
