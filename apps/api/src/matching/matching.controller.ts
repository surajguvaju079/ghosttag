import {
  Body,
  Controller,
  Delete,
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
import { MatchingService } from './matching.service';

@Controller('matching')
@UseGuards(AnonymousIdentityGuard, SocialAccessGuard)
export class MatchingController {
  constructor(private readonly matches: MatchingService) {}
  @Get('state')
  @Header('Cache-Control', 'no-store')
  @RateLimit('MATCH_HEARTBEAT')
  state(@Req() req: AuthenticatedRequest) {
    return this.matches.state(req.credentialHash);
  }
  @Post('search')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimit('MATCH_SEARCH')
  start(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.matches.start(req.credentialHash, body);
  }
  @Post('search/:id/heartbeat')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimit('MATCH_HEARTBEAT')
  heartbeat(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.matches.heartbeat(req.credentialHash, id);
  }
  @Delete('search/:id')
  @Header('Cache-Control', 'no-store')
  @RateLimit('MATCH_ACTION')
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.matches.cancel(req.credentialHash, id);
  }
  @Post('sessions/:id/extend')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimit('MATCH_ACTION')
  extend(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.matches.action(req.credentialHash, id, 'extend');
  }
  @Post('sessions/:id/end')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimit('MATCH_ACTION')
  end(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.matches.action(req.credentialHash, id, 'end');
  }
  @Post('sessions/:id/block')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimit('MATCH_ACTION')
  block(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.matches.action(req.credentialHash, id, 'block');
  }
  @Delete('blocks')
  @Header('Cache-Control', 'no-store')
  @RateLimit('MATCH_ACTION')
  clear(@Req() req: AuthenticatedRequest) {
    return this.matches.clearBlocks(req.credentialHash);
  }
}
