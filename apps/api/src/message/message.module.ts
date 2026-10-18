import { MessageReportController } from './message-report.controller';
import { MessageReportService } from './message-report.service';
import { Module } from '@nestjs/common';
import { IdentityModule } from 'src/identity/identity.module';
import { RoomModule } from 'src/room/room.module';
import { MessageController } from './message.controller';
import { MessageGateway } from './message.gateway';
import { MessageRepository } from './message.repository';
import { MessageService } from './message.service';

@Module({
  imports: [IdentityModule, RoomModule],
  controllers: [MessageController, MessageReportController],
  providers: [
    MessageService,
    MessageRepository,
    MessageGateway,
    MessageReportService,
  ],
})
export class MessageModule {}
