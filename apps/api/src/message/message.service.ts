import { AgeEligibilityService } from 'src/identity/age-eligibility.service';
import { RateLimitService } from 'src/safety/rate-limit.service';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, Room, RoomMembership } from 'generated/prisma/client';
import { createHash } from 'node:crypto';
import {
  IdentityCredentialService,
  VerifiedCredential,
} from 'src/common/auth/identity-credential.service';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { RoomService } from 'src/room/room.service';
import { MessageRepository, messageInclude } from './message.repository';
import {
  historyQuery,
  reactionPayload,
  reactionTypes,
  roomCode,
  sendPayload,
  voicePayload,
} from './message.validation';

type StoredMessage = Prisma.MessageGetPayload<{
  include: typeof messageInclude;
}>;
export interface MessageAccess {
  tx: Prisma.TransactionClient;
  room: Room;
  membership: RoomMembership;
  credential: VerifiedCredential;
}

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: IdentityCredentialService,
    private readonly rooms: RoomService,
    private readonly repository: MessageRepository,
    private readonly rates: RateLimitService,
    private readonly eligibility: AgeEligibilityService,
  ) {}

  access<T>(
    hash: string,
    code: unknown,
    action: (access: MessageAccess) => T | Promise<T>,
    exclusive = false,
  ): Promise<T> {
    const normalized = roomCode(code);
    return this.prisma.$transaction(
      async (tx) => {
        const credential = await this.credentials.verify(hash, tx);
        await this.eligibility.assertAccess(credential.userId, tx);
        const { room, membership } = await this.rooms.authorizeActiveMember(
          tx,
          credential.userId,
          normalized,
          exclusive ? 'exclusive' : 'shared',
        );
        this.assertLive({ room, credential });
        return action({ tx, room, membership, credential });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  assertLive(access: Pick<MessageAccess, 'room' | 'credential'>) {
    this.credentials.assertValid(access.credential);
    this.eligibility.assertEnabled();
    this.rooms.assertAccessible(access.room);
  }

  async send(hash: string, value: unknown) {
    const input = sendPayload(value);
    return this.access(
      hash,
      input.code,
      async ({ tx, room, membership, credential }) => {
        const previous = await this.repository.findRetry(
          tx,
          membership.id,
          input.clientMessageId,
        );
        if (
          previous &&
          (previous.voiceClip ||
            previous.text !== input.text ||
            previous.replyTo?.publicId !== input.replyToMessageId)
        ) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Retry key was already used with different text',
          });
        }
        this.assertLive({ room, credential });
        if (!previous) this.rates.consume('MESSAGE_BURST', credential.userId);
        const target =
          input.replyToMessageId && !previous
            ? await this.repository.findPublic(
                tx,
                room.id,
                input.replyToMessageId,
              )
            : undefined;
        if (input.replyToMessageId && !previous && !target)
          throw new NotFoundException({
            code: 'MESSAGE_NOT_FOUND',
            message: 'Reply target not found',
          });
        const stored =
          previous ??
          (await this.repository.create(
            tx,
            room.id,
            membership.id,
            input.text,
            input.clientMessageId,
            target?.id,
          ));
        this.assertLive({ room, credential });
        return {
          message: this.publicMessage(stored, room.code, membership.id),
          replayed: !!previous,
          clientMessageId: input.clientMessageId,
        };
      },
      true,
    );
  }

  async sendVoice(
    hash: string,
    code: unknown,
    key: unknown,
    duration: unknown,
    contentType: unknown,
    data: Buffer,
  ) {
    const input = voicePayload(code, key, duration, contentType, data);
    const sha256 = createHash('sha256').update(input.data).digest('hex');
    return this.access(
      hash,
      input.code,
      async ({ tx, room, membership, credential }) => {
        const previous = await this.repository.findRetry(
          tx,
          membership.id,
          input.clientMessageId,
        );
        if (
          previous &&
          (!previous.voiceClip ||
            previous.voiceClip.sha256 !== sha256 ||
            previous.voiceClip.durationMs !== input.durationMs)
        )
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Retry key was already used with different audio',
          });
        this.assertLive({ room, credential });
        if (!previous) this.rates.consume('MESSAGE_BURST', credential.userId);
        const stored =
          previous ??
          (await this.repository.createVoice(
            tx,
            room.id,
            membership.id,
            input.clientMessageId,
            input.durationMs,
            input.data,
            sha256,
          ));
        this.assertLive({ room, credential });
        return {
          message: this.publicMessage(stored, room.code, membership.id),
          replayed: !!previous,
          clientMessageId: input.clientMessageId,
        };
      },
      true,
    );
  }

  audio(hash: string, code: string, messageId: string) {
    if (!/^m_[0-9a-f]{32}$/.test(messageId))
      throw new NotFoundException({
        code: 'MESSAGE_NOT_FOUND',
        message: 'Message not found',
      });
    return this.access(hash, code, async ({ tx, room, credential }) => {
      const message = await this.repository.findPublic(tx, room.id, messageId);
      if (!message?.voiceClip)
        throw new NotFoundException({
          code: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
      const clip = await tx.voiceClip.findUniqueOrThrow({
        where: { messageId: message.id },
        select: { data: true },
      });
      this.assertLive({ room, credential });
      return Buffer.from(clip.data);
    });
  }

  delivery<T>(
    hash: string,
    code: string,
    messageId: string,
    action: (
      access: MessageAccess,
      message: ReturnType<MessageService['publicMessage']>,
    ) => T,
  ) {
    return this.access(hash, code, async (access) => {
      // Re-resolve persisted content in the authorized room. A recycled public room
      // code must never deliver a cached message from its previous incarnation.
      const stored = await this.repository.findPublic(
        access.tx,
        access.room.id,
        messageId,
      );
      if (!stored) return;
      this.assertLive(access);
      return action(
        access,
        this.publicMessage(stored, access.room.code, access.membership.id),
      );
    });
  }

  history(hash: string, code: string, query: unknown) {
    const { limit, before } = historyQuery(query);
    return this.access(
      hash,
      code,
      async ({ tx, room, membership, credential }) => {
        const rows = await this.repository.history(tx, room.id, limit, before);
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        this.assertLive({ room, credential });
        return {
          messages: page.map((row) =>
            this.publicMessage(row, room.code, membership.id),
          ),
          nextCursor: hasMore ? page[page.length - 1].publicId : null,
        };
      },
    );
  }

  private publicMessage(
    message: StoredMessage,
    code: string,
    membershipId?: string,
  ) {
    return {
      messageId: message.publicId,
      code,
      text: message.text,
      ...(message.voiceClip
        ? { voice: { durationMs: message.voiceClip.durationMs } }
        : {}),
      createdAt: message.createdAt.toISOString(),
      author: {
        participantId: message.membership.publicId,
        ghostName: message.membership.ghostName,
        ghostAvatar: message.membership.ghostAvatar,
      },
      ...(message.replyTo
        ? {
            replyTo: {
              messageId: message.replyTo.publicId,
              text: message.replyTo.text,
              author: {
                participantId: message.replyTo.membership.publicId,
                ghostName: message.replyTo.membership.ghostName,
                ghostAvatar: message.replyTo.membership.ghostAvatar,
              },
            },
          }
        : {}),
      ...(message.reactions.length
        ? {
            reactions: reactionTypes
              .map((type) => ({
                type,
                count: message.reactions.filter(
                  (reaction) => reaction.type === type,
                ).length,
                mine: message.reactions.some(
                  (reaction) =>
                    reaction.type === type &&
                    reaction.membershipId === membershipId,
                ),
              }))
              .filter((reaction) => reaction.count > 0),
          }
        : {}),
    };
  }

  react(hash: string, value: unknown) {
    const input = reactionPayload(value);
    return this.access(
      hash,
      input.code,
      async ({ tx, room, membership }) => {
        const message = await this.repository.findPublic(
          tx,
          room.id,
          input.messageId,
        );
        if (!message)
          throw new NotFoundException({
            code: 'MESSAGE_NOT_FOUND',
            message: 'Message not found',
          });
        const where = {
          messageId_membershipId: {
            messageId: message.id,
            membershipId: membership.id,
          },
        };
        const existing = await tx.reaction.findUnique({
          where,
          select: { type: true },
        });
        if (existing?.type === input.type) await tx.reaction.delete({ where });
        else if (existing)
          await tx.reaction.update({ where, data: { type: input.type } });
        else
          await tx.reaction.create({
            data: {
              messageId: message.id,
              membershipId: membership.id,
              type: input.type,
            },
          });
        return this.reactionSummary(
          tx,
          room.code,
          message.id,
          message.publicId,
          membership.id,
        );
      },
      true,
    );
  }

  reactionSnapshot(hash: string, code: string, messageId: string) {
    return this.access(hash, code, async ({ tx, room, membership }) => {
      const message = await this.repository.findPublic(tx, room.id, messageId);
      if (!message) return;
      return this.reactionSummary(
        tx,
        room.code,
        message.id,
        messageId,
        membership.id,
      );
    });
  }

  private async reactionSummary(
    tx: Prisma.TransactionClient,
    code: string,
    id: string,
    messageId: string,
    membershipId: string,
  ) {
    const rows = await tx.reaction.findMany({
      where: { messageId: id },
      select: { type: true, membershipId: true },
    });
    return {
      code,
      messageId,
      reactions: reactionTypes
        .map((type) => ({
          type,
          count: rows.filter((row) => row.type === type).length,
          mine: rows.some(
            (row) => row.type === type && row.membershipId === membershipId,
          ),
        }))
        .filter((reaction) => reaction.count > 0),
    };
  }
}
