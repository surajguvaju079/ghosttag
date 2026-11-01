import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AgeEligibilityService } from 'src/identity/age-eligibility.service';
import type { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class SocialAccessGuard implements CanActivate {
  constructor(private readonly eligibility: AgeEligibilityService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.eligibility.assertAccess(request.identity.id);
    return true;
  }
}
