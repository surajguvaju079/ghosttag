import { MessageReportController } from './message-report.controller';
import { MessageReportService } from './message-report.service';
import { Module } from '@nestjs/common';
import { IdentityModule } from 'src/identity/identity.module';
import { RoomModule } from 'src/room/room.module';
import { MessageController } from './message.controller';
import { MessageGateway } from './message.gateway';
import { MessageRepository } from './message.repository';
import { MessageService } from './message.service';
import { PlaygroundController, PulseController } from './playground.controller';
import { PulseService } from './pulse.service';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { GameRepository } from './game.repository';

@Module({
  imports: [IdentityModule, RoomModule],
  controllers: [
    MessageController,
    MessageReportController,
    PlaygroundController,
    PulseController,
    GameController,
  ],
  providers: [
    MessageService,
    MessageRepository,
    MessageGateway,
    MessageReportService,
    PulseService,
    GameService,
    GameRepository,
  ],
})
export class MessageModule {}
