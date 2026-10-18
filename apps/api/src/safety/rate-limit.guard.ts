import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from 'src/common/auth/authenticated-request';
import { RateLimitService, RatePolicy } from './rate-limit.service';

export function RateLimit(policy: RatePolicy) {
  return applyDecorators(
    SetMetadata('safety:rate', policy),
    UseGuards(RateLimitGuard),
  );
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rates: RateLimitService,
    private readonly reflector: Reflector,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.get<RatePolicy>(
      'safety:rate',
      context.getHandler(),
    );
    if (policy) {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      this.rates.consume(
        policy,
        request.identity?.id,
        request.socket.remoteAddress ?? 'unknown',
      );
    }
    return true;
  }
}
