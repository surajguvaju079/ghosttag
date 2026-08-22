import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "src/database/prisma/prisma.service";





@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) { }
  async createIdentity() {
    const rawToken = `gt_${randomBytes(32).toString('base64url')}`;
    const tokenHash = this.hashToken(rawToken);

    const identity = await this.prisma.$transaction(async (tx) => {
      const user = await tx.anonymousUser.create({
        data: {},
      })
      await tx.identityCredential.create({
        data: {
          userId: user.id,
          tokenHash
        }
      })
      return user;


    })
    return {
      token: rawToken,
      identityId: identity.id
    }


  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');

  }
}
