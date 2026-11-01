import { AgeEligibilityService } from './age-eligibility.service';
import { RateLimit } from 'src/safety/rate-limit.guard';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import type { AuthenticatedRequest } from 'src/common/auth/authenticated-request';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';

@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly eligibility: AgeEligibilityService,
  ) {}
  @Post()
  @RateLimit('IDENTITY_CREATE')
  createIdentity() {
    return this.identityService.createIdentity();
  }

  @Post('age-eligibility')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimit('AGE_ASSESSMENT')
  @UseGuards(AnonymousIdentityGuard)
  assessAge(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.eligibility.assess(request.identity.id, body);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AnonymousIdentityGuard)
  async getIdentity(@Req() request: AuthenticatedRequest) {
    return {
      identityId: request.identity.id,
      ...(await this.eligibility.status(request.identity.id)),
    };
  }
}
