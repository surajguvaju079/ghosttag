import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

export interface VerifiedCredential {
  userId: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class IdentityCredentialService {
  constructor(private readonly prisma: PrismaService) {}

  hashToken(token: unknown): string {
    if (typeof token !== 'string' || !token || token.length > 512) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Anonymous identity credential is required.',
      });
    }
    return createHash('sha256').update(token).digest('hex');
  }

  assertValid(
    credential: VerifiedCredential | null | undefined,
  ): asserts credential is VerifiedCredential {
    if (!credential)
      throw new UnauthorizedException({
        code: 'INVALID_IDENTITY_CREDENTIAL',
        message: 'Invalid anonymous identity credential',
      });
    if (credential.revokedAt)
      throw new UnauthorizedException({
        code: 'IDENTITY_REVOKED',
        message: 'Anonymous identity has been revoked.',
      });
    if (credential.expiresAt && credential.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        code: 'IDENTITY_EXPIRED',
        message: 'Anonymous identity credential has expired.',
      });
    }
  }

  async verify(hash: string, tx?: Prisma.TransactionClient) {
    const credential = tx
      ? (
          await tx.$queryRaw<VerifiedCredential[]>`
          SELECT "userId", "expiresAt", "revokedAt" FROM "identity_credentials"
          WHERE "tokenHash" = ${hash} FOR SHARE
        `
        )[0]
      : await this.prisma.identityCredential.findUnique({
          where: { tokenHash: hash },
          select: { userId: true, expiresAt: true, revokedAt: true },
        });
    this.assertValid(credential);
    return credential;
  }
}
