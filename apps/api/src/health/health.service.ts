import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/database/prisma/prisma.service";




@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) { }
  async check() {
    const database = await this.checkDatabase()
    return {
      status: database ? 'ok' : 'degraded',
      services: {
        api: "ok",
        database: database ? 'ok' : 'error'
      }

    }
  }
  async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    }
    catch {
      return false
    }

  }
}
