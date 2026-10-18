import {
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { randomInt } from 'crypto';
import type { Prisma, Room, RoomMembership } from 'generated/prisma/client';

@Injectable()
export class RoomService {
  private readonly roomLifetimeMs = 24 * 60 * 60 * 1000;
  private readonly roomCodeMaxAttempts = 10;

  constructor(private readonly prisma: PrismaService) {}

  async createRoom(userId: string, dto: CreateRoomDto) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.roomLifetimeMs);

    for (let attempt = 0; attempt < this.roomCodeMaxAttempts; attempt++) {
      const code = this.generateRoomCode();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const room = await tx.room.create({
            data: {
              code,
              vibe: dto.vibe,
              name: dto.name?.trim() || null,
              creatorId: userId,
              status: 'ACTIVE',
              createdAt: now,
              expiresAt,
            },
          });

          const membership = await tx.roomMembership.create({
            data: {
              roomId: room.id,
              userId,
              role: 'OWNER',
              status: 'ACTIVE',
              ghostName: this.generateGhostName(),
              ghostAvatar: this.generateGhostAvatar(),
              joinedAt: now,
            },
          });

          return {
            id: room.id,
            code: room.code,
            vibe: room.vibe,
            name: room.name,
            expiresAt: room.expiresAt,
            membership: {
              ghostName: membership.ghostName,
              ghostAvatar: membership.ghostAvatar,
            },
          };
        });
      } catch (error) {
        if (this.isRoomCodeConflict(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new InternalServerErrorException({
      code: 'ROOM_CODE_GENERATION_FAILED',
      message: 'Unable to create room',
    });
  }

  async joinRoom(userId: string, code: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const room = await this.lockAccessibleRoom(tx, code);
        const membership = await tx.roomMembership.findUnique({
          where: { userId_roomId: { userId, roomId: room.id } },
        });

        if (membership?.status === 'ACTIVE') {
          return this.joinResponse(room, membership);
        }

        const activeMemberCount = await tx.roomMembership.count({
          where: { roomId: room.id, status: 'ACTIVE' },
        });
        if (activeMemberCount >= 50) {
          throw new ConflictException({
            code: 'ROOM_FULL',
            message: 'This room is full',
          });
        }

        const activeMembership = membership
          ? await tx.roomMembership.update({
              where: { id: membership.id },
              data: { status: 'ACTIVE', leftAt: null },
            })
          : await tx.roomMembership.create({
              data: {
                roomId: room.id,
                userId,
                role: 'MEMBER',
                status: 'ACTIVE',
                ghostName: this.generateGhostName(),
                ghostAvatar: this.generateGhostAvatar(),
              },
            });

        return this.joinResponse(room, activeMembership);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async leaveRoom(userId: string, code: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const room = await this.lockAccessibleRoom(tx, code);
        const membership = await tx.roomMembership.findUnique({
          where: { userId_roomId: { userId, roomId: room.id } },
        });
        if (!membership) {
          throw new ForbiddenException({
            code: 'ROOM_MEMBERSHIP_REQUIRED',
            message: 'Room membership is required',
          });
        }
        // Repeated leaves succeed without changing the original departure time.
        if (membership.status === 'LEFT') return;

        await tx.roomMembership.update({
          where: { id: membership.id },
          data: { status: 'LEFT', leftAt: new Date() },
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async lockAccessibleRoom(tx: Prisma.TransactionClient, code: string) {
    const normalizedCode = code.trim().toUpperCase();
    // All joins/leaves lock the same room before reading or changing membership.
    // At READ COMMITTED, queries after the lock see the preceding holder's commit.
    const [room] = await tx.$queryRaw<Room[]>`
      SELECT * FROM "rooms" WHERE "code" = ${normalizedCode} FOR UPDATE
    `;
    if (!room) {
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: 'Room not found',
      });
    }
    // Check time after acquiring the lock: a room may expire while we wait.
    const now = new Date();
    if (room.expiresAt <= now) {
      throw new GoneException({
        code: 'ROOM_EXPIRED',
        message: 'This room has expired',
      });
    }
    if (room.lockedUntil && room.lockedUntil > now) {
      throw new HttpException(
        {
          code: 'ROOM_LOCKED',
          message: 'This room is temporarily locked',
        },
        423,
      );
    }
    return room;
  }

  private joinResponse(room: Room, membership: RoomMembership) {
    return {
      room: {
        code: room.code,
        vibe: room.vibe,
        name: room.name,
        expiresAt: room.expiresAt,
      },
      membership: {
        ghostName: membership.ghostName,
        ghostAvatar: membership.ghostAvatar,
        role: membership.role,
      },
    };
  }

  private generateRoomCode(): string {
    const number = randomInt(0, 10_000);

    return `GH-${number.toString().padStart(4, '0')}`;
  }

  private generateGhostName(): string {
    const adjectives = [
      'Quiet',
      'Cosmic',
      'Hidden',
      'Chill',
      'Misty',
      'Wild',
      'Lucky',
      'Neon',
    ];

    const nouns = [
      'Raven',
      'Shadow',
      'Nova',
      'Ghost',
      'Pixel',
      'Comet',
      'Fox',
      'Echo',
    ];

    const adjective = adjectives[randomInt(0, adjectives.length)];

    const noun = nouns[randomInt(0, nouns.length)];

    return `${adjective} ${noun}`;
  }
  private generateGhostAvatar(): string {
    const avatars = [
      'raven',
      'shadow',
      'nova',
      'ghost',
      'pixel',
      'comet',
      'fox',
      'echo',
    ];

    return avatars[randomInt(0, avatars.length)];
  }

  private isRoomCodeConflict(error: unknown): boolean {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    if (!('meta' in error)) {
      return false;
    }

    const meta = error.meta;

    if (typeof meta !== 'object' || meta === null || !('target' in meta)) {
      return false;
    }

    const target = meta.target;

    return Array.isArray(target) && target.includes('code');
  }
}
