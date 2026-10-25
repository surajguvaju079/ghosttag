import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RetentionRepository } from './retention.repository';
import { RetentionService } from './retention.service';
import { RetentionRunner } from './retention.runner';

@Module({
  imports: [ConfigModule],
  providers: [RetentionRepository, RetentionService, RetentionRunner],
})
export class RetentionModule {}
