import { createHash } from 'node:crypto';
import type { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { IdentityCredentialService } from './identity-credential.service';

describe('IdentityCredentialService', () => {
  const prisma = { identityCredential: { findUnique: jest.fn() } };
  const service: IdentityCredentialService = new IdentityCredentialService(
    prisma as unknown as PrismaService,
  );
  const valid = { userId: 'internal-user', revokedAt: null, expiresAt: null };
  it('hashes credentials before lookup', async () => {
    const hash = service.hashToken('private-test-token');
    expect(hash).toBe(
      createHash('sha256').update('private-test-token').digest('hex'),
    );
    prisma.identityCredential.findUnique.mockResolvedValue(valid);
    await expect(service.verify(hash)).resolves.toEqual(valid);
    expect(prisma.identityCredential.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hash },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });
  });
  it.each([undefined, '', 1, 'x'.repeat(513)])(
    'rejects missing or oversized credentials',
    (token) => {
      expect(() => service.hashToken(token)).toThrow();
    },
  );
  it.each([
    [null, 'INVALID_IDENTITY_CREDENTIAL'],
    [{ ...valid, revokedAt: new Date() }, 'IDENTITY_REVOKED'],
    [{ ...valid, expiresAt: new Date(0) }, 'IDENTITY_EXPIRED'],
  ])('rejects invalid credentials', (credential, code) => {
    try {
      service.assertValid(credential);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toMatchObject({ response: { code }, status: 401 });
    }
  });
  it('locks credentials inside authorization transactions', async () => {
    const tx = {
      $queryRaw: jest
        .fn<Promise<unknown[]>, [TemplateStringsArray, string]>()
        .mockResolvedValue([valid]),
    };
    await service.verify('hash', tx as unknown as Prisma.TransactionClient);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR SHARE');
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('hash');
  });
});
