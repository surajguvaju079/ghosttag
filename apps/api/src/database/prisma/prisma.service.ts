import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { PrismaPg } from '@prisma/adapter-pg'
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const databaseUrl = configService.get<string>('database.url')
    if (!databaseUrl) {
      throw new Error('Database url is not configured');
    }
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
    })
    super({ adapter })
  }
  async onModuleInit(): Promise<void> {
    await this.$connect()

  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
