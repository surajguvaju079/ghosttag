import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { REPORT_REASONS } from 'src/safety/report-reasons';
import { CreateRoomDto } from './dto/create-room.dto';
import { PrismaService } from 'src/database/prisma/prisma.service';
import { randomInt, randomUUID } from 'crypto';
import type { Prisma, Room, RoomMembership } from 'generated/prisma/client';

@Injectable()
export class RoomService {
  private readonly roomLifetimeMs = 24 * 60 * 60 * 1000;
  private readonly roomCodeMaxAttempts = 10;
  private readonly maxCapacity = 50;
  private readonly leaveListeners = new Set<
    (event: { userId: string; code: string }) => void
  >();

  onLeave(
    listener: (event: { userId: string; code: string }) => void,
  ): () => void {
    this.leaveListeners.add(listener);
    return () => {
      this.leaveListeners.delete(listener);
    };
  }

  notifyLeaves(events: { userId: string; code: string }[]) {
    for (const event of events)
      for (const listener of this.leaveListeners) {
        try {
          listener(event);
        } catch {
          // Authorization checks remain authoritative after a transport failure.
        }
      }
  }

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
              inviteId: randomUUID(),
              discoverable: dto.discoverable ?? false,
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

  async joinRoom(userId: string, code: string, inviteId?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7210912345::bigint)`;
        return this.joinInTransaction(tx, userId, code, inviteId);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
  private async joinInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    code: string,
    inviteId?: string,
  ) {
    const room = await this.lockAccessibleRoom(tx, code, 'exclusive', inviteId);
    const membership = await tx.roomMembership.findUnique({
      where: { userId_roomId: { userId, roomId: room.id } },
    });

    if (room.kind === 'MATCHED')
      await this.assertMatchedParty(tx, room.id, userId);
    else await this.assertNoBlockedMember(tx, room.id, userId);
    if (membership?.status === 'ACTIVE') {
      return this.joinResponse(room, membership);
    }

    const activeMemberCount = await tx.roomMembership.count({
      where: { roomId: room.id, status: 'ACTIVE' },
    });
    if (activeMemberCount >= this.capacity(room)) {
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
  }

  private async assertNoBlockedMember(
    tx: Prisma.TransactionClient,
    roomId: string,
    userId: string,
  ) {
    const rows = await tx.$queryRaw<{ blocked: number }[]>`
      SELECT 1 AS blocked FROM "match_blocks" b
      JOIN "room_memberships" m ON m."userId" =
        CASE WHEN b."blockerId" = ${userId}::uuid THEN b."blockedId" ELSE b."blockerId" END
      WHERE (b."blockerId" = ${userId}::uuid OR b."blockedId" = ${userId}::uuid)
        AND m."roomId" = ${roomId}::uuid AND m."status" = 'ACTIVE'
      LIMIT 1`;
    if (rows.length)
      throw new ForbiddenException({
        code: 'ROOM_ACCESS_BLOCKED',
        message: 'This room is unavailable.',
      });
  }

  async createMatchedRoom(
    tx: Prisma.TransactionClient,
    userAId: string,
    userBId: string,
    topic: string,
  ) {
    const now = new Date();
    const room = await tx.room.create({
      data: {
        code: this.generateRoomCode(),
        kind: 'MATCHED',
        creatorId: userAId,
        vibe: 'DEEP_TALK',
        name: 'A little company',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 900_000),
      },
    });
    for (const [index, userId] of [userAId, userBId].entries()) {
      await tx.roomMembership.create({
        data: {
          roomId: room.id,
          userId,
          role: index === 0 ? 'OWNER' : 'MEMBER',
          ghostName: this.generateGhostName(),
          ghostAvatar: this.generateGhostAvatar(),
        },
      });
    }
    await tx.matchSession.create({
      data: { roomId: room.id, userAId, userBId, topic },
    });
    return room;
  }
  async closeMatchedRoom(tx: Prisma.TransactionClient, roomId: string) {
    const [room] = await tx.$queryRaw<
      Room[]
    >`SELECT * FROM "rooms" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
    if (room?.kind === 'MATCHED' && room.status !== 'EXPIRED') {
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: 'EXPIRED',
          expiresAt: new Date(Math.min(Date.now(), room.expiresAt.getTime())),
        },
      });
    }
  }
  private async assertMatchedParty(
    tx: Prisma.TransactionClient,
    roomId: string,
    userId: string,
  ) {
    const session = await tx.matchSession.findFirst({
      where: { roomId, OR: [{ userAId: userId }, { userBId: userId }] },
    });
    if (!session)
      throw new ForbiddenException({
        code: 'PRIVATE_ROOM_ACCESS_REQUIRED',
        message: 'This conversation is private.',
      });
  }
  private capacity(room: Room) {
    return room.kind === 'MATCHED' ? 2 : this.maxCapacity;
  }

  async leaveRoom(userId: string, code: string): Promise<void> {
    const event = await this.prisma.$transaction(
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
        if (room.kind === 'MATCHED') {
          await this.assertMatchedParty(tx, room.id, userId);
          await this.closeMatchedRoom(tx, room.id);
          return { userId, code: room.code };
        }
        // Repeated leaves succeed without changing the original departure time.
        if (membership.status === 'LEFT') return { userId, code: room.code };

        await tx.roomMembership.update({
          where: { id: membership.id },
          data: { status: 'LEFT', leftAt: new Date() },
        });
        return { userId, code: room.code };
      },
      { isolationLevel: 'ReadCommitted' },
    );
    this.notifyLeaves([event]);
  }

  async reportParticipant(
    userId: string,
    code: string,
    participantId: string,
    body: unknown,
  ) {
    if (!/^p_[0-9a-f]{32}$/.test(participantId))
      throw new BadRequestException({
        code: 'INVALID_PARTICIPANT',
        message: 'Invalid participant.',
      });
    const reason =
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      Object.keys(body).length === 1 &&
      'reason' in body
        ? body.reason
        : undefined;
    if (typeof reason !== 'string' || !REPORT_REASONS.has(reason))
      throw new BadRequestException({
        code: 'INVALID_REPORT_REASON',
        message: 'Invalid report reason.',
      });
    return this.readAsActiveMember(userId, code, async (tx, room, reporter) => {
      const target = await tx.roomMembership.findFirst({
        where: { roomId: room.id, publicId: participantId, status: 'ACTIVE' },
      });
      if (!target || target.userId === userId)
        throw new NotFoundException({
          code: 'PARTICIPANT_NOT_FOUND',
          message: 'Participant not found.',
        });
      await tx.participantReport.createMany({
        data: [
          {
            roomId: room.id,
            reporterMembershipId: reporter.id,
            targetMembershipId: target.id,
            reason,
          },
        ],
        skipDuplicates: true,
      });
      return { accepted: true };
    });
  }

  async blockParticipant(userId: string, code: string, participantId: string) {
    if (!/^p_[0-9a-f]{32}$/.test(participantId))
      throw new BadRequestException({
        code: 'INVALID_PARTICIPANT',
        message: 'Invalid participant.',
      });
    const separated = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7210912345::bigint)`;
        const { room } = await this.authorizeActiveMember(
          tx,
          userId,
          code,
          'exclusive',
        );
        if (room.kind !== 'GROUP')
          throw new BadRequestException({
            code: 'INVALID_PARTICIPANT',
            message: 'Use match controls for this conversation.',
          });
        const target = await tx.roomMembership.findFirst({
          where: { roomId: room.id, publicId: participantId, status: 'ACTIVE' },
        });
        if (!target || target.userId === userId)
          throw new NotFoundException({
            code: 'PARTICIPANT_NOT_FOUND',
            message: 'Participant not found.',
          });
        await tx.matchBlock.upsert({
          where: {
            blockerId_blockedId: {
              blockerId: userId,
              blockedId: target.userId,
            },
          },
          create: { blockerId: userId, blockedId: target.userId },
          update: {},
        });
        return this.separateForBlock(tx, userId, target.userId);
      },
      { isolationLevel: 'ReadCommitted' },
    );
    this.notifyLeaves(separated.events);
    return {
      blocked: true,
      leftRooms: separated.leftRooms,
    };
  }

  // The caller holds the matching/join advisory lock. This reuses the private
  // identity block for both matching and group-room admission.
  async separateForBlock(
    tx: Prisma.TransactionClient,
    blockerId: string,
    blockedId: string,
  ) {
    const shared = await tx.$queryRaw<{ roomId: string; code: string }[]>`
      SELECT r."id" AS "roomId", r."code" FROM "rooms" r
      JOIN "room_memberships" mine ON mine."roomId" = r."id"
      JOIN "room_memberships" theirs ON theirs."roomId" = r."id"
      WHERE r."kind" = 'GROUP' AND r."status" = 'ACTIVE' AND r."expiresAt" > now()
        AND mine."userId" = ${blockerId}::uuid AND mine."status" = 'ACTIVE'
        AND theirs."userId" = ${blockedId}::uuid AND theirs."status" = 'ACTIVE'
      ORDER BY r."id"`;
    const events: { userId: string; code: string }[] = [];
    const leftRooms: string[] = [];
    for (const item of shared) {
      await tx.$queryRaw`SELECT "id" FROM "rooms" WHERE "id" = ${item.roomId}::uuid FOR UPDATE`;
      const stillTogether = await tx.roomMembership.count({
        where: { roomId: item.roomId, userId: blockedId, status: 'ACTIVE' },
      });
      if (!stillTogether) continue;
      const updated = await tx.roomMembership.updateMany({
        where: { roomId: item.roomId, userId: blockerId, status: 'ACTIVE' },
        data: { status: 'LEFT', leftAt: new Date() },
      });
      if (updated.count) {
        events.push({ userId: blockerId, code: item.code });
        leftRooms.push(item.code);
      }
    }
    const session = await tx.matchSession.findFirst({
      where: {
        OR: [
          { userAId: blockerId, userBId: blockedId },
          { userAId: blockedId, userBId: blockerId },
        ],
        room: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
      },
      include: { room: { select: { code: true } } },
    });
    if (session) {
      await this.closeMatchedRoom(tx, session.roomId);
      events.push(
        { userId: blockerId, code: session.room.code },
        { userId: blockedId, code: session.room.code },
      );
    }
    return { events, leftRooms };
  }

  async listRooms(userId: string) {
    const memberships = await this.prisma.roomMembership.findMany({
      where: {
        userId,
        room: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
      },
      orderBy: [{ joinedAt: 'desc' }, { room: { code: 'asc' } }],
      select: {
        status: true,
        room: {
          select: {
            code: true,
            kind: true,
            inviteId: true,
            matchSession: { select: { publicId: true } },
            name: true,
            vibe: true,
            expiresAt: true,
            lockedUntil: true,
          },
        },
      },
    });
    return {
      rooms: memberships.map(({ room, status }) => {
        const { matchSession, ...details } = room;
        return {
          ...details,
          matchId: matchSession?.publicId ?? null,
          membershipStatus: status,
        };
      }),
    };
  }

  async discoverRooms(userId: string, cursor?: string) {
    let before: { createdAt: string; inviteId: string } | null = null;
    if (cursor !== undefined) {
      try {
        if (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor))
          throw new Error('Invalid cursor');
        const value: unknown = JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8'),
        );
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          typeof value[0] !== 'string' ||
          typeof value[1] !== 'string' ||
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value[0]) ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value[1])
        )
          throw new Error('Invalid cursor');
        before = { createdAt: value[0], inviteId: value[1] };
        if (Number.isNaN(Date.parse(value[0])))
          throw new Error('Invalid cursor');
      } catch {
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: 'Invalid discovery cursor.',
        });
      }
    }
    const rows = await this.prisma.$queryRaw<
      {
        code: string;
        inviteId: string;
        vibe: Room['vibe'];
        createdAtCursor: string;
        expiresAt: Date;
        activeMemberCount: number;
      }[]
    >`
      SELECT r."code", r."inviteId", r."vibe", r."expiresAt",
             to_char(r."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAtCursor",
             count(m."id")::int AS "activeMemberCount"
      FROM "rooms" r
      LEFT JOIN "room_memberships" m ON m."roomId" = r."id" AND m."status" = 'ACTIVE'
      WHERE r."kind" = 'GROUP' AND r."discoverable" = true
        AND r."status" = 'ACTIVE' AND r."expiresAt" > now()
        AND (r."lockedUntil" IS NULL OR r."lockedUntil" <= now())
        AND r."inviteId" IS NOT NULL
        AND (${before?.createdAt ?? null}::timestamptz IS NULL OR
          (r."createdAt", r."inviteId") < (${before?.createdAt ?? null}::timestamptz, ${before?.inviteId ?? null}::uuid))
        AND NOT EXISTS (
          SELECT 1 FROM "room_memberships" own
          WHERE own."roomId" = r."id" AND own."userId" = ${userId}::uuid AND own."status" = 'ACTIVE'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "room_memberships" peer
          JOIN "match_blocks" b ON
            (b."blockerId" = ${userId}::uuid AND b."blockedId" = peer."userId") OR
            (b."blockedId" = ${userId}::uuid AND b."blockerId" = peer."userId")
          WHERE peer."roomId" = r."id" AND peer."status" = 'ACTIVE'
        )
      GROUP BY r."id"
      HAVING count(m."id") < ${this.maxCapacity}
      ORDER BY r."createdAt" DESC, r."inviteId" DESC
      LIMIT 21`;
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return {
      rooms: page.map(
        ({ code, inviteId, vibe, expiresAt, activeMemberCount }) => ({
          code,
          inviteId,
          vibe,
          expiresAt,
          activeMemberCount,
        }),
      ),
      nextCursor:
        rows.length > 20 && last
          ? Buffer.from(
              JSON.stringify([last.createdAtCursor, last.inviteId]),
            ).toString('base64url')
          : null,
    };
  }

  async setDiscovery(userId: string, code: string, body: unknown) {
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      typeof (body as { discoverable?: unknown }).discoverable !== 'boolean'
    )
      throw new BadRequestException({
        code: 'INVALID_DISCOVERY',
        message: 'Choose whether to list this room.',
      });
    const discoverable = (body as { discoverable: boolean }).discoverable;
    return this.prisma.$transaction(async (tx) => {
      const room = await this.lockAccessibleRoom(tx, code);
      const membership = await tx.roomMembership.findUnique({
        where: { userId_roomId: { userId, roomId: room.id } },
      });
      if (
        room.kind !== 'GROUP' ||
        room.creatorId !== userId ||
        membership?.status !== 'ACTIVE' ||
        membership.role !== 'OWNER'
      )
        throw new ForbiddenException({
          code: 'ROOM_OWNER_REQUIRED',
          message: 'Only the active room host can change discovery.',
        });
      await tx.room.update({ where: { id: room.id }, data: { discoverable } });
      return { discoverable };
    });
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
            kind: room.kind ?? 'GROUP',
            inviteId: room.inviteId ?? null,
            discoverable: room.discoverable,
            matchId:
              room.kind === 'MATCHED'
                ? (
                    await tx.matchSession.findUniqueOrThrow({
                      where: { roomId: room.id },
                    })
                  ).publicId
                : null,
            vibe: room.vibe,
            name: room.name,
            createdAt: room.createdAt,
            expiresAt: room.expiresAt,
            activeMemberCount,
            maxCapacity: this.capacity(room),
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
          publicId: true,
          ghostName: true,
          ghostAvatar: true,
          role: true,
          joinedAt: true,
        },
      });
      return {
        members: members.map(({ publicId, ...member }) => ({
          participantId: publicId,
          ...member,
        })),
        total: members.length,
        maxCapacity: this.capacity(room),
      };
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
        const { room, membership } = await this.authorizeActiveMember(
          tx,
          userId,
          code,
        );
        return read(tx, room, membership);
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  async authorizeActiveMember(
    tx: Prisma.TransactionClient,
    userId: string,
    code: string,
    lock: 'shared' | 'exclusive' = 'shared',
  ) {
    const room = await this.lockAccessibleRoom(tx, code, lock);
    if (room.kind === 'MATCHED')
      await this.assertMatchedParty(tx, room.id, userId);
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
    return { room, membership };
  }

  private async lockAccessibleRoom(
    tx: Prisma.TransactionClient,
    code: string,
    lock: 'shared' | 'exclusive' = 'exclusive',
    inviteId?: string,
  ) {
    const normalizedCode = code.trim().toUpperCase();
    // Shared read locks coexist and block the exclusive locks used by join/leave.
    // At READ COMMITTED, queries after the lock see the preceding writer's commit.
    const [room] = inviteId
      ? await tx.$queryRaw<
          Room[]
        >`SELECT * FROM "rooms" WHERE "code" = ${normalizedCode} AND "inviteId" = ${inviteId}::uuid AND "kind" = 'GROUP' FOR UPDATE`
      : lock === 'shared'
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
    this.assertAccessible(room);
    return room;
  }

  assertAccessible(room: Room): void {
    // Check time after acquiring the lock: a room may expire while we wait.
    const now = new Date();
    if (room.status === 'EXPIRED' || room.expiresAt <= now) {
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

  isRoomCodeConflict(error: unknown): boolean {
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
      if (meta.target.includes('code')) return true;
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
      (('fields' in constraint &&
        Array.isArray(constraint.fields) &&
        constraint.fields.includes('code')) ||
        ('index' in constraint && constraint.index === 'rooms_code_key'))
    );
  }
}
