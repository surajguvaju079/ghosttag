import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from './authenticated-request';
import { IdentityCredentialService } from './identity-credential.service';

@Injectable()
export class AnonymousIdentityGuard implements CanActivate {
  constructor(private readonly credentials: IdentityCredentialService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token, extra] =
      request.headers.authorization?.split(' ') ?? [];
    const hash = this.credentials.hashToken(
      scheme === 'Bearer' && !extra ? token : undefined,
    );
    const credential = await this.credentials.verify(hash);
    request.identity = { id: credential.userId };
    request.credentialHash = hash;
    return true;
  }
}
