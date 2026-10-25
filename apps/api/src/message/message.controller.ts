import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';
import type { AuthenticatedRequest } from 'src/common/auth/authenticated-request';
import { MessageService } from './message.service';

@Controller('rooms/:code/messages')
@UseGuards(AnonymousIdentityGuard)
export class MessageController {
  constructor(private readonly messages: MessageService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  history(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.messages.history(request.credentialHash, code, query);
  }
}
