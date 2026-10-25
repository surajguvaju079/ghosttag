import { MessageRepository } from './message.repository';
import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageService } from './message.service';
import { payload } from './message.validation';

const reasons = new Set([
  'SPAM',
  'HARASSMENT',
  'HATE',
  'SEXUAL_CONTENT',
  'THREAT',
  'CHILD_SAFETY',
  'OTHER',
]);

@Injectable()
export class MessageReportService {
  constructor(
    private readonly messages: MessageService,
    private readonly repository: MessageRepository,
  ) {}

  submit(hash: string, code: string, messageId: string, body: unknown) {
    if (!/^m_[0-9a-f]{32}$/.test(messageId))
      throw new BadRequestException({
        code: 'INVALID_MESSAGE_ID',
        message: 'Invalid public message identifier',
      });
    const { reason } = payload(body, ['reason']);
    if (typeof reason !== 'string' || !reasons.has(reason))
      throw new BadRequestException({
        code: 'INVALID_REPORT_REASON',
        message: 'Invalid report reason',
      });
    return this.messages.access(
      hash,
      code,
      async ({ tx, room, membership, credential }) => {
        await this.repository.report(
          tx,
          room.id,
          membership.id,
          messageId,
          reason,
        );
        this.messages.assertLive({ room, credential });
        return { accepted: true };
      },
    );
  }
}
