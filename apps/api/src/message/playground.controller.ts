import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';
import { SocialAccessGuard } from 'src/common/auth/social-access.guard';
import type { AuthenticatedRequest } from 'src/common/auth/authenticated-request';
import { RateLimit } from 'src/safety/rate-limit.guard';
import { MessageGateway } from './message.gateway';
import { PulseService } from './pulse.service';

@Controller('playground')
@UseGuards(AnonymousIdentityGuard, SocialAccessGuard)
export class PlaygroundController {
  constructor(private readonly pulses: PulseService) {}

  @Get('today')
  @Header('Cache-Control', 'no-store')
  today() {
    return this.pulses.today();
  }
}

@Controller('rooms/:code/pulses')
@UseGuards(AnonymousIdentityGuard, SocialAccessGuard)
export class PulseController {
  constructor(
    private readonly pulses: PulseService,
    private readonly gateway: MessageGateway,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedRequest, @Param('code') code: string) {
    return this.pulses.list(request.credentialHash, code);
  }

  @Post()
  @HttpCode(200)
  @RateLimit('PULSE_ACTION')
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    const result = await this.pulses.start(request.credentialHash, code, body);
    if (result.created)
      await this.gateway.notifyPulse(result.pulse.code, result.pulse.pulseId);
    return result.pulse;
  }

  @Post(':pulseId/vote')
  @HttpCode(200)
  @RateLimit('PULSE_ACTION')
  async vote(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Param('pulseId') pulseId: string,
    @Body() body: unknown,
  ) {
    const result = await this.pulses.vote(
      request.credentialHash,
      code,
      pulseId,
      body,
    );
    if (result.recorded)
      await this.gateway.notifyPulse(result.pulse.code, result.pulse.pulseId);
    return result.pulse;
  }
}
