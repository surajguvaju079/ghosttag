import { Injectable } from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { RoomService } from 'src/room/room.service';

@Injectable()
export class MatchingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomService,
  ) {}
  async transaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(7210912345::bigint)`;
            return action(tx);
          },
          { isolationLevel: 'ReadCommitted' },
        );
      } catch (error) {
        if (attempt >= 9 || !this.rooms.isRoomCodeConflict(error)) throw error;
      }
    }
  }
  search(tx: Prisma.TransactionClient, userId: string) {
    return tx.matchSearch.findUnique({ where: { userId } });
  }
  activeSession(tx: Prisma.TransactionClient, userId: string) {
    return tx.matchSession.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        room: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
      },
      include: { room: true },
    });
  }
  session(tx: Prisma.TransactionClient, publicId: string, userId: string) {
    return tx.matchSession.findFirst({
      where: { publicId, OR: [{ userAId: userId }, { userBId: userId }] },
      include: { room: true },
    });
  }
  async lockSessionRoom(tx: Prisma.TransactionClient, roomId: string) {
    await tx.$queryRaw`SELECT "id" FROM "rooms" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
    return tx.matchSession.findUniqueOrThrow({
      where: { roomId },
      include: { room: true },
    });
  }
  candidates(tx: Prisma.TransactionClient, userId: string) {
    const now = new Date();
    return tx.matchSearch.findMany({
      where: {
        userId: { not: userId },
        expiresAt: { gt: now },
        leaseUntil: { gt: now },
      },
      orderBy: [{ createdAt: 'asc' }, { publicId: 'asc' }],
    });
  }
  blocked(tx: Prisma.TransactionClient, a: string, b: string) {
    return tx.matchBlock.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
  }
  credential(tx: Prisma.TransactionClient, userId: string) {
    return tx.identityCredential.findUnique({
      where: { userId },
      select: { tokenHash: true },
    });
  }
  start(tx: Prisma.TransactionClient, userId: string) {
    const now = Date.now();
    return tx.matchSearch.create({
      data: {
        userId,
        expiresAt: new Date(now + 120_000),
        leaseUntil: new Date(now + 30_000),
      },
    });
  }
  renew(tx: Prisma.TransactionClient, userId: string, expiresAt: Date) {
    return tx.matchSearch.update({
      where: { userId },
      data: {
        leaseUntil: new Date(
          Math.min(Date.now() + 30_000, expiresAt.getTime()),
        ),
      },
    });
  }
  removeSearch(
    tx: Prisma.TransactionClient,
    userId: string,
    publicId?: string,
  ) {
    return tx.matchSearch.deleteMany({
      where: { userId, ...(publicId ? { publicId } : {}) },
    });
  }
  pruneOwn(tx: Prisma.TransactionClient, userId: string) {
    const now = new Date();
    return tx.matchSearch.deleteMany({
      where: {
        userId,
        OR: [{ expiresAt: { lte: now } }, { leaseUntil: { lte: now } }],
      },
    });
  }
  vote(tx: Prisma.TransactionClient, roomId: string, sideA: boolean) {
    return tx.matchSession.update({
      where: { roomId },
      data: sideA ? { voteA: true } : { voteB: true },
    });
  }
  async extend(tx: Prisma.TransactionClient, roomId: string, deadline: Date) {
    await tx.matchSession.update({
      where: { roomId },
      data: { extended: true },
    });
    await tx.room.update({
      where: { id: roomId },
      data: { expiresAt: new Date(deadline.getTime() + 900_000) },
    });
  }
  block(tx: Prisma.TransactionClient, blockerId: string, blockedId: string) {
    return tx.matchBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
  }
  clearBlocks(tx: Prisma.TransactionClient, blockerId: string) {
    return tx.matchBlock.deleteMany({ where: { blockerId } });
  }
  blockCount(tx: Prisma.TransactionClient, blockerId: string) {
    return tx.matchBlock.count({ where: { blockerId } });
  }
}
