import { Injectable } from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';
import { messageInclude } from './message.repository';

export const gameInclude = {
  starter: true,
  choices: { include: { membership: true } },
  turns: {
    include: { membership: true, message: { include: messageInclude } },
    orderBy: { sequence: 'desc' },
    take: 20,
  },
} as const;

export type StoredGame = Prisma.RoomGameGetPayload<{
  include: typeof gameInclude;
}>;

@Injectable()
export class GameRepository {
  latest(tx: Prisma.TransactionClient, roomId: string) {
    return tx.roomGame.findFirst({
      where: { roomId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: gameInclude,
    });
  }

  byPublic(tx: Prisma.TransactionClient, publicId: string) {
    return tx.roomGame.findUnique({
      where: { publicId },
      include: gameInclude,
    });
  }

  byStartKey(
    tx: Prisma.TransactionClient,
    roomId: string,
    membershipId: string,
    clientGameId: string,
  ) {
    return tx.roomGame.findUnique({
      where: {
        roomId_startedByMembershipId_clientGameId: {
          roomId,
          startedByMembershipId: membershipId,
          clientGameId,
        },
      },
      include: gameInclude,
    });
  }

  create(
    tx: Prisma.TransactionClient,
    roomId: string,
    membershipId: string,
    clientGameId: string,
    kind: string,
    deadlineAt: Date,
  ) {
    return tx.roomGame.create({
      data: {
        roomId,
        startedByMembershipId: membershipId,
        clientGameId,
        kind,
        deadlineAt,
      },
      include: gameInclude,
    });
  }

  end(tx: Prisma.TransactionClient, id: string, now: Date) {
    return tx.roomGame.update({
      where: { id },
      data: { endedAt: now },
      include: gameInclude,
    });
  }

  async choose(
    tx: Prisma.TransactionClient,
    gameId: string,
    membershipId: string,
    choice: string,
  ) {
    await tx.gameChoice.create({ data: { gameId, membershipId, choice } });
    return tx.roomGame.findUniqueOrThrow({
      where: { id: gameId },
      include: gameInclude,
    });
  }

  turnByKey(
    tx: Prisma.TransactionClient,
    gameId: string,
    membershipId: string,
    clientTurnId: string,
  ) {
    return tx.gameTurn.findUnique({
      where: {
        gameId_membershipId_clientTurnId: {
          gameId,
          membershipId,
          clientTurnId,
        },
      },
      include: { message: { include: messageInclude } },
    });
  }

  async createTurn(
    tx: Prisma.TransactionClient,
    game: StoredGame,
    membershipId: string,
    clientTurnId: string,
    title: string,
    nextCue: string,
    now: Date,
  ) {
    const message = await tx.message.create({
      data: {
        roomId: game.roomId,
        membershipId,
        clientMessageId: clientTurnId,
        text: `🎵 ${title} · next sound: ${nextCue}`,
      },
      include: messageInclude,
    });
    const sequence = (game.turns[0]?.sequence ?? 0) + 1;
    await tx.gameTurn.create({
      data: {
        gameId: game.id,
        membershipId,
        clientTurnId,
        sequence,
        title,
        nextCue,
        messageId: message.id,
      },
    });
    const updated = await tx.roomGame.update({
      where: { id: game.id },
      data: { lastActionAt: now },
      include: gameInclude,
    });
    return { updated, message };
  }
}
