import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from 'generated/prisma/client';

@Injectable()
export class MessageRepository {
  findPublic(tx: Prisma.TransactionClient, roomId: string, publicId: string) {
    return tx.message.findUnique({
      where: { publicId, roomId },
      include: { membership: true },
    });
  }

  async report(
    tx: Prisma.TransactionClient,
    roomId: string,
    reporterMembershipId: string,
    publicId: string,
    reason: string,
  ) {
    const message = await tx.message.findUnique({
      where: { publicId, roomId },
      select: { id: true },
    });
    if (!message)
      throw new NotFoundException({
        code: 'MESSAGE_NOT_FOUND',
        message: 'Message not found',
      });
    await tx.messageReport.createMany({
      data: { messageId: message.id, reporterMembershipId, reason },
      skipDuplicates: true,
    });
  }

  findRetry(
    tx: Prisma.TransactionClient,
    membershipId: string,
    clientMessageId: string,
  ) {
    return tx.message.findUnique({
      where: {
        membershipId_clientMessageId: { membershipId, clientMessageId },
      },
      include: { membership: true },
    });
  }

  create(
    tx: Prisma.TransactionClient,
    roomId: string,
    membershipId: string,
    text: string,
    clientMessageId: string,
  ) {
    return tx.message.create({
      data: { roomId, membershipId, text, clientMessageId },
      include: { membership: true },
    });
  }

  async history(
    tx: Prisma.TransactionClient,
    roomId: string,
    limit: number,
    before?: string,
  ) {
    if (
      before &&
      !(await tx.message.findUnique({
        where: { publicId: before, roomId },
        select: { publicId: true },
      }))
    ) {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: 'Invalid message cursor',
      });
    }
    return tx.message.findMany({
      where: { roomId },
      orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
      ...(before ? { cursor: { publicId: before }, skip: 1 } : {}),
      take: limit + 1,
      include: { membership: true },
    });
  }
}
