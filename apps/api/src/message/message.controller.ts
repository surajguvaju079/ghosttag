import { SocialAccessGuard } from 'src/common/auth/social-access.guard';
import {
  Controller,
  Get,
  Header,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';
import type { AuthenticatedRequest } from 'src/common/auth/authenticated-request';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';
import { RateLimit } from 'src/safety/rate-limit.guard';

@Controller('rooms/:code/messages')
@UseGuards(AnonymousIdentityGuard, SocialAccessGuard)
export class MessageController {
  constructor(
    private readonly messages: MessageService,
    private readonly gateway: MessageGateway,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  history(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.messages.history(request.credentialHash, code, query);
  }

  @Post('voice')
  @Header('Cache-Control', 'no-store')
  @RateLimit('VOICE_SEND')
  async sendVoice(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
  ) {
    if (Number(request.headers['content-length']) > 5_242_880)
      throw new PayloadTooLargeException({
        code: 'VOICE_TOO_LARGE',
        message: 'Voice clip exceeds 5 MiB',
      });
    const parts: Buffer[] = [];
    let length = 0;
    for await (const part of request) {
      const bytes = Buffer.from(part as Buffer);
      length += bytes.length;
      if (length > 5_242_880)
        throw new PayloadTooLargeException({
          code: 'VOICE_TOO_LARGE',
          message: 'Voice clip exceeds 5 MiB',
        });
      parts.push(bytes);
    }
    const result = await this.messages.sendVoice(
      request.credentialHash,
      code,
      request.headers['x-client-message-id'],
      request.headers['x-voice-duration-ms'],
      request.headers['content-type'],
      Buffer.concat(parts, length),
    );
    if (!result.replayed) await this.gateway.notifyMessage(result.message);
    return result;
  }

  @Get(':messageId/audio')
  async audio(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Param('messageId') messageId: string,
    @Res() response: Response,
  ) {
    const bytes = await this.messages.audio(
      request.credentialHash,
      code,
      messageId,
    );
    response.set({
      'Cache-Control': 'no-store',
      'Content-Type': 'audio/mp4',
      'Content-Length': String(bytes.length),
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(bytes);
  }
}
