import { RetentionModule } from './retention/retention.module';
import { SafetyModule } from './safety/safety.module';
import { MessageModule } from './message/message.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './database/prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { RoomModule } from './room/room.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    SafetyModule,
    PrismaModule,
    HealthModule,
    IdentityModule,
    RoomModule,
    MessageModule,
    RetentionModule,
  ],
})
export class AppModule {}
