import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, Room, RoomMembership } from 'generated/prisma/client';
import {
  IdentityCredentialService,
  VerifiedCredential,
} from 'src/common/auth/identity-credential.service';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { RoomService } from 'src/room/room.service';
import { MessageRepository } from './message.repository';
import { historyQuery, roomCode, sendPayload } from './message.validation';

type StoredMessage = Prisma.MessageGetPayload<{
  include: { membership: true };
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
        if (previous && previous.text !== input.text) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Retry key was already used with different text',
          });
        }
        this.assertLive({ room, credential });
        const stored =
          previous ??
          (await this.repository.create(
            tx,
            room.id,
            membership.id,
            input.text,
            input.clientMessageId,
          ));
        this.assertLive({ room, credential });
        return {
          message: this.publicMessage(stored, room.code),
          replayed: !!previous,
          clientMessageId: input.clientMessageId,
        };
      },
      true,
    );
  }

  history(hash: string, code: string, query: unknown) {
    const { limit, before } = historyQuery(query);
    return this.access(hash, code, async ({ tx, room, credential }) => {
      const rows = await this.repository.history(tx, room.id, limit, before);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      this.assertLive({ room, credential });
      return {
        messages: page.map((row) => this.publicMessage(row, room.code)),
        nextCursor: hasMore ? page[page.length - 1].publicId : null,
      };
    });
  }

  private publicMessage(message: StoredMessage, code: string) {
    return {
      messageId: message.publicId,
      code,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
      author: {
        participantId: message.membership.publicId,
        ghostName: message.membership.ghostName,
        ghostAvatar: message.membership.ghostAvatar,
      },
    };
  }
}
