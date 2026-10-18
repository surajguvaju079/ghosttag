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
  private readonly maxCapacity = 50;

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
        if (activeMemberCount >= this.maxCapacity) {
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

  async getRoom(userId: string, code: string) {
    return this.readAsActiveMember(
      userId,
      code,
      async (tx, room, membership) => {
        const activeMemberCount = await tx.roomMembership.count({
          where: { roomId: room.id, status: 'ACTIVE' },
        });
        return {
          room: {
            code: room.code,
            vibe: room.vibe,
            name: room.name,
            createdAt: room.createdAt,
            expiresAt: room.expiresAt,
            activeMemberCount,
            maxCapacity: this.maxCapacity,
          },
          membership: this.publicIdentity(membership),
        };
      },
    );
  }

  async getMembers(userId: string, code: string) {
    return this.readAsActiveMember(userId, code, async (tx, room) => {
      const members = await tx.roomMembership.findMany({
        where: { roomId: room.id, status: 'ACTIVE' },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: {
          ghostName: true,
          ghostAvatar: true,
          role: true,
          joinedAt: true,
        },
      });
      return { members, total: members.length, maxCapacity: this.maxCapacity };
    });
  }

  async getMembership(userId: string, code: string) {
    return this.readAsActiveMember(userId, code, (_tx, _room, membership) => ({
      membership: {
        ...this.publicIdentity(membership),
        status: membership.status,
        joinedAt: membership.joinedAt,
        leftAt: membership.leftAt,
      },
    }));
  }

  private async readAsActiveMember<T>(
    userId: string,
    code: string,
    read: (
      tx: Prisma.TransactionClient,
      room: Room,
      membership: RoomMembership,
    ) => T | Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const room = await this.lockAccessibleRoom(tx, code, 'shared');
        const membership = await tx.roomMembership.findUnique({
          where: { userId_roomId: { userId, roomId: room.id } },
        });
        if (!membership) {
          throw new ForbiddenException({
            code: 'ROOM_MEMBERSHIP_REQUIRED',
            message: 'Room membership is required',
          });
        }
        if (membership.status !== 'ACTIVE') {
          throw new ForbiddenException({
            code: 'ROOM_MEMBERSHIP_INACTIVE',
            message: 'Active room membership is required',
          });
        }
        return read(tx, room, membership);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async lockAccessibleRoom(
    tx: Prisma.TransactionClient,
    code: string,
    lock: 'shared' | 'exclusive' = 'exclusive',
  ) {
    const normalizedCode = code.trim().toUpperCase();
    // Shared read locks coexist and block the exclusive locks used by join/leave.
    // At READ COMMITTED, queries after the lock see the preceding writer's commit.
    const [room] =
      lock === 'shared'
        ? await tx.$queryRaw<Room[]>`
          SELECT * FROM "rooms" WHERE "code" = ${normalizedCode} FOR SHARE
        `
        : await tx.$queryRaw<Room[]>`
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
      membership: this.publicIdentity(membership),
    };
  }

  private publicIdentity(membership: RoomMembership) {
    return {
      ghostName: membership.ghostName,
      ghostAvatar: membership.ghostAvatar,
      role: membership.role,
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

    if (typeof meta !== 'object' || meta === null) return false;
    if ('target' in meta && Array.isArray(meta.target)) {
      return meta.target.includes('code');
    }

    // Prisma 7's pg adapter reports the constraint through driverAdapterError.
    if (!('driverAdapterError' in meta)) return false;
    const adapterError = meta.driverAdapterError;
    if (
      typeof adapterError !== 'object' ||
      adapterError === null ||
      !('cause' in adapterError)
    )
      return false;
    const cause = adapterError.cause;
    if (
      typeof cause !== 'object' ||
      cause === null ||
      !('kind' in cause) ||
      cause.kind !== 'UniqueConstraintViolation' ||
      !('constraint' in cause)
    )
      return false;
    const constraint = cause.constraint;
    return (
      typeof constraint === 'object' &&
      constraint !== null &&
      'fields' in constraint &&
      Array.isArray(constraint.fields) &&
      constraint.fields.includes('code')
    );
  }
}
