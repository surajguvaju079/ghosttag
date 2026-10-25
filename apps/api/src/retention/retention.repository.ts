import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma/prisma.service';

@Injectable()
export class RetentionRepository {
  constructor(private readonly prisma: PrismaService) {}

  chunk(cutoff: Date, batchSize: number): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const [room] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "rooms" WHERE "expiresAt" <= ${cutoff}
        ORDER BY "expiresAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
      `;
        if (!room) return false;
        const messages = await tx.message.findMany({
          where: { roomId: room.id },
          select: { id: true },
          orderBy: [{ createdAt: 'asc' }, { publicId: 'asc' }],
          take: batchSize,
        });
        if (messages.length)
          await tx.message.deleteMany({
            where: { id: { in: messages.map((message) => message.id) } },
          });
        const polls = await tx.poll.findMany({
          where: { roomId: room.id },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: batchSize,
        });
        if (polls.length)
          await tx.poll.deleteMany({
            where: { id: { in: polls.map((poll) => poll.id) } },
          });
        const contentRemains =
          (await tx.message.findFirst({
            where: { roomId: room.id },
            select: { id: true },
          })) ||
          (await tx.poll.findFirst({
            where: { roomId: room.id },
            select: { id: true },
          }));
        if (!contentRemains) {
          const members = await tx.roomMembership.findMany({
            where: { roomId: room.id },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: batchSize,
          });
          if (members.length)
            await tx.roomMembership.deleteMany({
              where: { id: { in: members.map((member) => member.id) } },
            });
          if (
            !(await tx.roomMembership.findFirst({
              where: { roomId: room.id },
              select: { id: true },
            }))
          ) {
            await tx.room.delete({ where: { id: room.id } });
          }
        }
        return true;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
