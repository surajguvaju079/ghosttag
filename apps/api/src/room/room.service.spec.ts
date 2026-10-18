import { HttpException } from '@nestjs/common';
import { RoomService } from './room.service';
import { PrismaService } from 'src/database/prisma/prisma.service';

const room = {
  id: 'private-room',
  code: 'GH-1234',
  vibe: 'DEEP_TALK',
  name: null,
  expiresAt: new Date(Date.now() + 86_400_000),
  lockedUntil: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};
const membership = {
  id: 'private-membership',
  userId: 'private-user',
  roomId: room.id,
  ghostName: 'Quiet Raven',
  ghostAvatar: 'raven',
  role: 'OWNER',
  status: 'ACTIVE',
  leftAt: null,
  joinedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('RoomService', () => {
  const tx = {
    $queryRaw: jest.fn<Promise<unknown[]>, [TemplateStringsArray, string]>(),
    room: { create: jest.fn() },
    roomMembership: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const service = new RoomService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([room]);
    tx.room.create.mockResolvedValue(room);
    tx.roomMembership.findUnique.mockResolvedValue(null);
    tx.roomMembership.count.mockResolvedValue(1);
    tx.roomMembership.create.mockResolvedValue({
      ...membership,
      role: 'MEMBER',
    });
    tx.roomMembership.update.mockResolvedValue(membership);
  });

  it('creates a room and its OWNER membership atomically', async () => {
    await service.createRoom(membership.userId, {
      vibe: 'DEEP_TALK',
      name: '  Hello  ',
    });
    expect(tx.room.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creatorId: membership.userId,
          name: 'Hello',
          status: 'ACTIVE',
        }) as unknown,
      }),
    );
    expect(tx.roomMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId: room.id,
          role: 'OWNER',
          status: 'ACTIVE',
        }) as unknown,
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    { target: ['code'] },
    {
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['code'] },
        },
      },
    },
  ])(
    'retries room-code collisions with supported Prisma metadata (%p)',
    async (meta) => {
      tx.room.create.mockRejectedValueOnce({ code: 'P2002', meta });
      await expect(
        service.createRoom(membership.userId, { vibe: 'DEEP_TALK' }),
      ).resolves.toMatchObject({ code: room.code });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { target: ['userId', 'roomId'] },
    {
      driverAdapterError: {
        cause: {
          kind: 'UniqueConstraintViolation',
          constraint: { fields: ['userId', 'roomId'] },
        },
      },
    },
    {},
  ])(
    'does not retry unrelated or unidentified unique violations (%p)',
    async (meta) => {
      const error = { code: 'P2002', meta };
      tx.room.create.mockRejectedValueOnce(error);
      await expect(
        service.createRoom(membership.userId, { vibe: 'DEEP_TALK' }),
      ).rejects.toBe(error);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    },
  );

  it('normalizes the public code and returns only public join fields', async () => {
    const result = await service.joinRoom(membership.userId, ' gh-1234 ');
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('GH-1234');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
    expect(result).toEqual({
      room: {
        code: room.code,
        vibe: room.vibe,
        name: null,
        expiresAt: room.expiresAt,
      },
      membership: {
        ghostName: membership.ghostName,
        ghostAvatar: membership.ghostAvatar,
        role: 'MEMBER',
      },
    });
  });

  it('returns an ACTIVE membership even when the room is full', async () => {
    tx.roomMembership.findUnique.mockResolvedValue(membership);
    tx.roomMembership.count.mockResolvedValue(50);
    await service.joinRoom(membership.userId, room.code);
    expect(tx.roomMembership.count).not.toHaveBeenCalled();
    expect(tx.roomMembership.create).not.toHaveBeenCalled();
    expect(tx.roomMembership.update).not.toHaveBeenCalled();
  });

  it('reactivates a LEFT owner without changing identity, role, or joinedAt', async () => {
    tx.roomMembership.findUnique.mockResolvedValue({
      ...membership,
      status: 'LEFT',
    });
    const result = await service.joinRoom(membership.userId, room.code);
    expect(tx.roomMembership.update).toHaveBeenCalledWith({
      where: { id: membership.id },
      data: { status: 'ACTIVE', leftAt: null },
    });
    expect(result.membership.role).toBe('OWNER');
    expect(result.membership.ghostName).toBe(membership.ghostName);
  });

  it.each([null, { ...membership, status: 'LEFT' }])(
    'rejects entry at capacity (%p)',
    async (existing) => {
      tx.roomMembership.findUnique.mockResolvedValue(existing);
      tx.roomMembership.count.mockResolvedValue(50);
      await expect(
        service.joinRoom(membership.userId, room.code),
      ).rejects.toMatchObject({
        response: { code: 'ROOM_FULL' },
      });
      expect(tx.roomMembership.create).not.toHaveBeenCalled();
      expect(tx.roomMembership.update).not.toHaveBeenCalled();
    },
  );

  describe.each([
    'joinRoom',
    'leaveRoom',
    'getRoom',
    'getMembers',
    'getMembership',
  ] as const)('%s accessibility', (operation) => {
    it.each([
      [[], 404, 'ROOM_NOT_FOUND'],
      [
        [
          {
            ...room,
            expiresAt: new Date(0),
            lockedUntil: new Date(Date.now() + 60_000),
          },
        ],
        410,
        'ROOM_EXPIRED',
      ],
      [
        [{ ...room, lockedUntil: new Date(Date.now() + 60_000) }],
        423,
        'ROOM_LOCKED',
      ],
    ])('rejects inaccessible rooms (%s)', async (rooms, status, code) => {
      tx.$queryRaw.mockResolvedValue(rooms);
      try {
        await service[operation](membership.userId, room.code);
        throw new Error('Expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(status);
        expect((error as HttpException).getResponse()).toMatchObject({
          code,
        });
      }
      expect(tx.roomMembership.findUnique).not.toHaveBeenCalled();
    });
  });

  it('allows a room whose lock has elapsed', async () => {
    tx.$queryRaw.mockResolvedValue([{ ...room, lockedUntil: new Date(0) }]);
    await expect(
      service.joinRoom(membership.userId, room.code),
    ).resolves.toBeDefined();
  });

  it('leaves by changing only status and leftAt', async () => {
    tx.roomMembership.findUnique.mockResolvedValue(membership);
    await service.leaveRoom(membership.userId, room.code);
    expect(tx.roomMembership.update).toHaveBeenCalledWith({
      where: { id: membership.id },
      data: { status: 'LEFT', leftAt: expect.any(Date) as unknown },
    });
  });

  it('repeated leave preserves leftAt', async () => {
    tx.roomMembership.findUnique.mockResolvedValue({
      ...membership,
      status: 'LEFT',
      leftAt: new Date(0),
    });
    await expect(
      service.leaveRoom(membership.userId, room.code),
    ).resolves.toBeUndefined();
    expect(tx.roomMembership.update).not.toHaveBeenCalled();
  });

  it('notifies leave listeners after commit without exposing transport failures to REST', async () => {
    let committed = false;
    let observedAfterCommit = false;
    prisma.$transaction.mockImplementationOnce(async (work) => {
      const result = await work(tx);
      committed = true;
      return result;
    });
    tx.roomMembership.findUnique.mockResolvedValue(membership);
    const listener = jest.fn(() => {
      observedAfterCommit = committed;
      throw new Error('Transport failure');
    });
    const remove = service.onLeave(listener);
    try {
      await expect(
        service.leaveRoom(membership.userId, room.code),
      ).resolves.toBeUndefined();
      expect(observedAfterCommit).toBe(true);
      expect(listener).toHaveBeenCalledWith({
        userId: membership.userId,
        code: room.code,
      });
    } finally {
      remove();
    }
  });

  it('does not notify subscribers when leave is rejected', async () => {
    const listener = jest.fn();
    const remove = service.onLeave(listener);
    try {
      await expect(
        service.leaveRoom(membership.userId, room.code),
      ).rejects.toBeDefined();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      remove();
    }
  });

  it('rejects leave for someone who never joined', async () => {
    await expect(
      service.leaveRoom(membership.userId, room.code),
    ).rejects.toMatchObject({
      response: { code: 'ROOM_MEMBERSHIP_REQUIRED' },
    });
  });

  describe('active-member reads', () => {
    beforeEach(() => {
      tx.roomMembership.findUnique.mockResolvedValue(membership);
    });

    it('returns room details, public identity and ACTIVE capacity count', async () => {
      const result = await service.getRoom(membership.userId, ' gh-1234 ');
      expect(result).toEqual({
        room: {
          code: room.code,
          vibe: room.vibe,
          name: room.name,
          createdAt: room.createdAt,
          expiresAt: room.expiresAt,
          activeMemberCount: 1,
          maxCapacity: 50,
        },
        membership: {
          ghostName: membership.ghostName,
          ghostAvatar: membership.ghostAvatar,
          role: 'OWNER',
        },
      });
      expect(tx.roomMembership.count).toHaveBeenCalledWith({
        where: { roomId: room.id, status: 'ACTIVE' },
      });
      expect(tx.$queryRaw.mock.calls[0][1]).toBe('GH-1234');
      expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR SHARE');
    });

    it('queries only ACTIVE participants in this room with deterministic ordering and public fields', async () => {
      const publicMember = {
        ghostName: membership.ghostName,
        ghostAvatar: membership.ghostAvatar,
        role: membership.role,
        joinedAt: membership.joinedAt,
      };
      tx.roomMembership.findMany.mockResolvedValue([publicMember]);
      await expect(
        service.getMembers(membership.userId, room.code),
      ).resolves.toEqual({
        members: [publicMember],
        total: 1,
        maxCapacity: 50,
      });
      expect(tx.roomMembership.findMany).toHaveBeenCalledWith({
        where: { roomId: room.id, status: 'ACTIVE' },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: {
          ghostName: true,
          ghostAvatar: true,
          role: true,
          joinedAt: true,
        },
      });
    });

    it('returns only the current public membership and its timestamps', async () => {
      await expect(
        service.getMembership(membership.userId, room.code),
      ).resolves.toEqual({
        membership: {
          ghostName: membership.ghostName,
          ghostAvatar: membership.ghostAvatar,
          role: membership.role,
          status: 'ACTIVE',
          joinedAt: membership.joinedAt,
          leftAt: null,
        },
      });
      expect(tx.roomMembership.findUnique).toHaveBeenCalledWith({
        where: {
          userId_roomId: { userId: membership.userId, roomId: room.id },
        },
      });
    });

    describe.each(['getRoom', 'getMembers', 'getMembership'] as const)(
      '%s authorization',
      (operation) => {
        it.each([
          [null, 'ROOM_MEMBERSHIP_REQUIRED'],
          [{ ...membership, status: 'LEFT' }, 'ROOM_MEMBERSHIP_INACTIVE'],
        ])(
          'rejects missing or inactive membership (%p)',
          async (existing, code) => {
            tx.roomMembership.findUnique.mockResolvedValue(existing);
            await expect(
              service[operation](membership.userId, room.code),
            ).rejects.toMatchObject({
              status: 403,
              response: { code },
            });
            expect(tx.roomMembership.count).not.toHaveBeenCalled();
            expect(tx.roomMembership.findMany).not.toHaveBeenCalled();
          },
        );

        it('does not change membership state', async () => {
          tx.roomMembership.findMany.mockResolvedValue([]);
          await service[operation](membership.userId, room.code);
          expect(tx.roomMembership.create).not.toHaveBeenCalled();
          expect(tx.roomMembership.update).not.toHaveBeenCalled();
          expect(prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: 'ReadCommitted' },
          );
        });
      },
    );
  });
});
