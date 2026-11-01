import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from 'generated/prisma/client';
import { AgeEligibilityRepository } from './age-eligibility.repository';

export const AGE_POLICY_VERSION = '18-plus-v1';
export const ageAccessCodes = [
  'AGE_SCREENING_REQUIRED',
  'AGE_INELIGIBLE',
  'SOCIAL_ACCESS_DISABLED',
];

export function adultOnDate(value: unknown, now = new Date()): boolean {
  const invalid = () =>
    new BadRequestException({
      code: 'INVALID_BIRTH_DATE',
      message: 'Enter a valid birth date.',
    });
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw invalid();
  const birth = new Date(`${value}T00:00:00.000Z`);
  const today = now.toISOString().slice(0, 10);
  if (
    !Number.isFinite(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== value ||
    value > today ||
    birth.getUTCFullYear() < 1
  )
    throw invalid();
  // Date overflow deliberately makes February 29's non-leap anniversary March 1.
  const anniversary = new Date(birth);
  anniversary.setUTCFullYear(birth.getUTCFullYear() + 18);
  return anniversary.toISOString().slice(0, 10) <= today;
}

@Injectable()
export class AgeEligibilityService {
  constructor(
    private readonly repository: AgeEligibilityRepository,
    private readonly config: ConfigService,
  ) {}

  get policyVersion() {
    const version =
      this.config.get<string>('AGE_POLICY_VERSION') ?? AGE_POLICY_VERSION;
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(version))
      throw new Error('Invalid AGE_POLICY_VERSION');
    return version;
  }
  get socialAccessEnabled() {
    return this.config.get<unknown>('SOCIAL_ACCESS_ENABLED') === 'true';
  }
  assertEnabled() {
    if (!this.socialAccessEnabled)
      throw new ServiceUnavailableException({
        code: 'SOCIAL_ACCESS_DISABLED',
        message: 'Social access is not available.',
      });
  }
  async status(userId: string) {
    return this.project(await this.repository.read(userId));
  }
  async assess(userId: string, body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !('dateOfBirth' in body)
    ) {
      throw new BadRequestException({
        code: 'INVALID_BIRTH_DATE',
        message: 'Enter a valid birth date.',
      });
    }
    const result = adultOnDate(body.dateOfBirth) ? 'ELIGIBLE' : 'INELIGIBLE';
    return this.project(
      await this.repository.assess(userId, this.policyVersion, result),
    );
  }
  async assertAccess(userId: string, tx?: Prisma.TransactionClient) {
    this.assertEnabled();
    const { ageEligibility } = this.project(
      await this.repository.read(userId, tx),
    );
    if (ageEligibility.status === 'REQUIRED')
      throw new ForbiddenException({
        code: 'AGE_SCREENING_REQUIRED',
        message: 'Age screening is required.',
      });
    if (ageEligibility.status === 'INELIGIBLE')
      throw new ForbiddenException({
        code: 'AGE_INELIGIBLE',
        message: 'This service is not available to this identity.',
      });
  }
  private project(
    record: Awaited<ReturnType<AgeEligibilityRepository['read']>>,
  ) {
    const current =
      record?.policyVersion === this.policyVersion ? record : null;
    return {
      ageEligibility: {
        status: current?.result ?? 'REQUIRED',
        method: current?.method ?? null,
        assessedAt: current?.assessedAt.toISOString() ?? null,
        policyVersion: this.policyVersion,
      },
      socialAccessEnabled: this.socialAccessEnabled,
    };
  }
}
