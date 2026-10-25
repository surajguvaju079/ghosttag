import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

export const defaultPolicies = {
  IDENTITY_CREATE: { network: 10, identity: 0, windowMs: 3_600_000 },
  ROOM_CREATE: { network: 30, identity: 10, windowMs: 3_600_000 },
  ROOM_JOIN: { network: 120, identity: 30, windowMs: 60_000 },
  MESSAGE_SEND: { network: 120, identity: 30, windowMs: 60_000 },
  MESSAGE_BURST: { network: 0, identity: 5, windowMs: 1000 },
  WS_CONNECT: { network: 120, identity: 20, windowMs: 60_000 },
  WS_SUBSCRIBE: { network: 180, identity: 30, windowMs: 60_000 },
  MESSAGE_REPORT: { network: 50, identity: 10, windowMs: 86_400_000 },
} as const;
export type RatePolicy = keyof typeof defaultPolicies;

export function positiveInteger(
  config: ConfigService,
  key: string,
  fallback: number,
  maximum = 1_000_000_000,
): number {
  const raw = config.get<unknown>(key);
  const value = raw === undefined ? fallback : Number(raw);
  if (
    (typeof raw !== 'undefined' &&
      typeof raw !== 'string' &&
      typeof raw !== 'number') ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(`Invalid positive integer configuration: ${key}`);
  }
  return value;
}

export function networkKey(peer?: string): string {
  const address = peer?.split('%')[0].toLowerCase() ?? '';
  const mapped = address.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1');
  if (isIP(mapped) === 4) return mapped;
  if (isIP(address) !== 6) return 'unknown';
  let hex = address;
  const dotted = hex.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) {
    const octets = dotted.split('.').map(Number);
    hex =
      hex.slice(0, -dotted.length) +
      ((octets[0] << 8) | octets[1]).toString(16) +
      ':' +
      ((octets[2] << 8) | octets[3]).toString(16);
  }
  const [left, right] = hex.split('::');
  const first = left ? left.split(':') : [];
  const last = right ? right.split(':') : [];
  const words =
    right !== undefined
      ? [
          ...first,
          ...Array<string>(8 - first.length - last.length).fill('0'),
          ...last,
        ]
      : first;
  const values = words.map((value) => parseInt(value, 16));
  if (
    values.slice(0, 5).every((value) => value === 0) &&
    values[5] === 0xffff
  ) {
    return [
      values[6] >> 8,
      values[6] & 255,
      values[7] >> 8,
      values[7] & 255,
    ].join('.');
  }
  return (
    values
      .slice(0, 4)
      .map((value) => value.toString(16).padStart(4, '0'))
      .join(':') + '::/64'
  );
}

@Injectable()
export class RateLimitService {
  private readonly salt = randomBytes(32);
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private readonly policies: Record<
    RatePolicy,
    { identity: number; network: number; windowMs: number }
  >;
  private readonly maxBuckets: number;
  private nextPrune = 0;

  constructor(config: ConfigService) {
    this.maxBuckets = positiveInteger(config, 'SAFETY_MAX_BUCKETS', 20_000);
    this.policies = Object.fromEntries(
      Object.entries(defaultPolicies).map(([name, defaults]) => [
        name,
        {
          identity: defaults.identity
            ? positiveInteger(
                config,
                `SAFETY_${name}_IDENTITY_LIMIT`,
                defaults.identity,
              )
            : 0,
          network: defaults.network
            ? positiveInteger(
                config,
                `SAFETY_${name}_NETWORK_LIMIT`,
                defaults.network,
              )
            : 0,
          windowMs: positiveInteger(
            config,
            `SAFETY_${name}_WINDOW_MS`,
            defaults.windowMs,
            86_400_000,
          ),
        },
      ]),
    ) as typeof this.policies;
  }

  consume(policy: RatePolicy, identity?: string, peer?: string): void {
    const now = Date.now();
    if (now >= this.nextPrune) this.prune(now);
    const limits = this.policies[policy];
    const keys: { key: string; limit: number }[] = [];
    if (identity && limits.identity)
      keys.push({
        key: this.key(policy, 'identity', identity),
        limit: limits.identity,
      });
    if (peer !== undefined && limits.network)
      keys.push({
        key: this.key(policy, 'network', networkKey(peer)),
        limit: limits.network,
      });
    let retryAfterMs = 0;
    for (const { key, limit } of keys) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.resetAt > now && bucket.count >= limit)
        retryAfterMs = Math.max(retryAfterMs, bucket.resetAt - now);
    }
    if (retryAfterMs) this.reject(retryAfterMs);
    let required = keys.filter(({ key }) => !this.buckets.has(key)).length;
    if (this.buckets.size + required > this.maxBuckets) {
      this.prune(now);
      required = keys.filter(({ key }) => !this.buckets.has(key)).length;
      if (this.buckets.size + required > this.maxBuckets) this.reject(1000);
    }
    for (const { key } of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket || bucket.resetAt <= now)
        this.buckets.set(key, { count: 1, resetAt: now + limits.windowMs });
      else bucket.count++;
    }
  }

  private key(policy: string, dimension: string, value: string) {
    return createHmac('sha256', this.salt)
      .update(`${policy}:${dimension}:${value}`)
      .digest('hex');
  }
  private prune(now: number) {
    for (const [key, bucket] of this.buckets)
      if (bucket.resetAt <= now) this.buckets.delete(key);
    this.nextPrune = now + 60_000;
  }
  private reject(retryAfterMs: number): never {
    throw new HttpException(
      { code: 'RATE_LIMITED', message: 'Too many requests', retryAfterMs },
      429,
    );
  }
}
