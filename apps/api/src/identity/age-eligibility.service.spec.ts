import { ConfigService } from '@nestjs/config';
import type { Prisma } from 'generated/prisma/client';
import { AgeEligibilityRepository } from './age-eligibility.repository';
import {
  adultOnDate,
  AgeEligibilityService,
  AGE_POLICY_VERSION,
} from './age-eligibility.service';

describe('18+ declared age screening', () => {
  it.each([
    ['2008-11-01', '2026-11-01T00:00:00Z', true],
    ['2008-11-02', '2026-11-01T23:59:59Z', false],
    ['2008-10-31', '2026-11-01T00:00:00Z', true],
    ['2008-02-29', '2026-02-28T23:59:59Z', false],
    ['2008-02-29', '2026-03-01T00:00:00Z', true],
  ])('evaluates %s at %s', (birth, current, adult) => {
    expect(adultOnDate(birth, new Date(current))).toBe(adult);
  });
  it.each([
    '',
    '2008-2-01',
    '2025-02-29',
    '2000-04-31',
    '0000-01-01',
    '2027-01-01',
    '2000-01-01T00:00:00Z',
    null,
    2000,
  ])('rejects invalid/future dates without echoing input', (input) => {
    expect(() => adultOnDate(input, new Date('2026-11-01'))).toThrow(
      'Enter a valid birth date.',
    );
  });

  const repository = { read: jest.fn(), assess: jest.fn() };
  const config = new ConfigService({ SOCIAL_ACCESS_ENABLED: 'true' });
  const service = new AgeEligibilityService(
    repository as unknown as AgeEligibilityRepository,
    config,
  );
  const record = {
    userId: 'internal',
    result: 'ELIGIBLE',
    method: 'DECLARED_DOB',
    policyVersion: AGE_POLICY_VERSION,
    assessedAt: new Date('2026-11-01'),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    config.set('SOCIAL_ACCESS_ENABLED', 'true');
    config.set('AGE_POLICY_VERSION', AGE_POLICY_VERSION);
  });
  it('defaults to disabled and fails closed on non-string settings', async () => {
    for (const value of [undefined, false, true, 'false', 'TRUE']) {
      const settings = new ConfigService({ SOCIAL_ACCESS_ENABLED: value });
      settings.set('SOCIAL_ACCESS_ENABLED', value);
      const instance = new AgeEligibilityService(
        repository as unknown as AgeEligibilityRepository,
        settings,
      );
      await expect(instance.assertAccess('user')).rejects.toMatchObject({
        response: { code: 'SOCIAL_ACCESS_DISABLED' },
        status: 503,
      });
    }
    expect(repository.read).not.toHaveBeenCalled();
  });
  it('projects only current policy eligibility metadata', async () => {
    repository.read.mockResolvedValue(record);
    expect(await service.status('internal')).toEqual({
      ageEligibility: {
        status: 'ELIGIBLE',
        method: 'DECLARED_DOB',
        assessedAt: record.assessedAt.toISOString(),
        policyVersion: AGE_POLICY_VERSION,
      },
      socialAccessEnabled: true,
    });
    config.set('AGE_POLICY_VERSION', 'new-policy');
    expect(await service.status('internal')).toEqual({
      ageEligibility: {
        status: 'REQUIRED',
        method: null,
        assessedAt: null,
        policyVersion: 'new-policy',
      },
      socialAccessEnabled: true,
    });
  });
  it.each([null, { ...record, policyVersion: 'older-policy' }])(
    'requires absent/stale screening',
    async (row) => {
      repository.read.mockResolvedValue(row);
      await expect(service.assertAccess('internal')).rejects.toMatchObject({
        response: { code: 'AGE_SCREENING_REQUIRED' },
        status: 403,
      });
    },
  );
  it('rejects ineligible users while preserving authentication semantics', async () => {
    repository.read.mockResolvedValue({ ...record, result: 'INELIGIBLE' });
    await expect(service.assertAccess('internal')).rejects.toMatchObject({
      response: { code: 'AGE_INELIGIBLE' },
      status: 403,
    });
  });
  it('passes the authorization transaction to the locking read', async () => {
    repository.read.mockResolvedValue(record);
    const tx = {} as Prisma.TransactionClient;
    await service.assertAccess('internal', tx);
    expect(repository.read).toHaveBeenCalledWith('internal', tx);
  });
  it('passes only the derived result to persistence', async () => {
    repository.assess.mockResolvedValue(record);
    await service.assess('internal', { dateOfBirth: '2000-01-01' });
    expect(repository.assess).toHaveBeenCalledWith(
      'internal',
      AGE_POLICY_VERSION,
      'ELIGIBLE',
    );
  });
  it.each([
    {},
    { dateOfBirth: '2000-01-01', userId: 'another-user' },
    { dateOfBirth: 'invalid' },
    [],
  ])('rejects malformed submissions without writing', async (body) => {
    await expect(service.assess('internal', body)).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.assess).not.toHaveBeenCalled();
  });
});
