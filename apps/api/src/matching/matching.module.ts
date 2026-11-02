import { Module } from '@nestjs/common';
import { IdentityModule } from 'src/identity/identity.module';
import { RoomModule } from 'src/room/room.module';
import { MatchingController } from './matching.controller';
import { MatchingRepository } from './matching.repository';
import { MatchingService } from './matching.service';
@Module({
  imports: [IdentityModule, RoomModule],
  controllers: [MatchingController],
  providers: [MatchingService, MatchingRepository],
})
export class MatchingModule {}
