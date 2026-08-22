import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "src/database/prisma/prisma.service";
import { AuthenticatedRequest } from "./authenticated-request";
import { createHash } from "node:crypto";




@Injectable()
export class AnonymousIdentityGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) { }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: "AUTHENTICATION_REQUIRED",
        message: "Anonymous identity credential is required."
      })
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const credential = await this.prisma.identityCredential.findUnique({
      where: { tokenHash },
      select: {
        userId: true,
        expiresAt: true,
        revokedAt: true
      }
    })
    if (!credential) {
      throw new UnauthorizedException({
        code: 'INVALID_IDENTITY_CREDENTIAL', message: 'Invalid anonymous identity credential'
      })
    }
    if (credential.revokedAt) {
      throw new UnauthorizedException({
        code: 'IDENTITY_REVOKED',
        message: 'Anonymous identity has been revoked.'
      })
    }
    if (credential.expiresAt && credential.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        code: 'IDENTITY_EXPIRED',
        message: 'Anonymous identity credential has expired.'
      })
    }
    request.identity = {
      id: credential.userId
    };
    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string | null {
    const authorization = request.headers.authorization;
    if (!authorization) {
      return null;
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return null;
    }
    return token;
  }

}
