import { Injectable } from '@nestjs/common';
import type { AgeEligibilityResult, Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';

@Injectable()
export class AgeEligibilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async read(userId: string, tx?: Prisma.TransactionClient) {
    // Every eligibility writer locks this parent exclusively. Lock order for
    // messaging is credential -> anonymous user -> room.
    if (tx)
      await tx.$queryRaw`SELECT "id" FROM "anonymous_users" WHERE "id" = ${userId}::uuid FOR SHARE`;
    return (tx ?? this.prisma).ageEligibility.findUnique({ where: { userId } });
  }

  assess(userId: string, policyVersion: string, result: AgeEligibilityResult) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "anonymous_users" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const existing = await tx.ageEligibility.findUnique({
        where: { userId },
      });
      if (existing?.policyVersion === policyVersion) return existing;
      return tx.ageEligibility.upsert({
        where: { userId },
        create: { userId, result, policyVersion },
        update: {
          result,
          policyVersion,
          method: 'DECLARED_DOB',
          assessedAt: new Date(),
        },
      });
    });
  }
}
