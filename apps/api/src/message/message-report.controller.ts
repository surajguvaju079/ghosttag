import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AnonymousIdentityGuard } from 'src/common/auth/anonymous-identity.guard';
import type { AuthenticatedRequest } from 'src/common/auth/authenticated-request';
import { RateLimit } from 'src/safety/rate-limit.guard';
import { MessageReportService } from './message-report.service';

@Controller('rooms/:code/messages/:messageId/reports')
@UseGuards(AnonymousIdentityGuard)
export class MessageReportController {
  constructor(private readonly reports: MessageReportService) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @RateLimit('MESSAGE_REPORT')
  submit(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Param('messageId') messageId: string,
    @Body() body: unknown,
  ) {
    return this.reports.submit(request.credentialHash, code, messageId, body);
  }
}
