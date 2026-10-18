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
};

describe('RoomService', () => {
  const tx = {
    $queryRaw: jest.fn<Promise<unknown[]>, [TemplateStringsArray, string]>(),
    room: { create: jest.fn() },
    roomMembership: {
      findUnique: jest.fn(),
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

  describe.each(['joinRoom', 'leaveRoom'] as const)(
    '%s accessibility',
    (operation) => {
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
    },
  );

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

  it('rejects leave for someone who never joined', async () => {
    await expect(
      service.leaveRoom(membership.userId, room.code),
    ).rejects.toMatchObject({
      response: { code: 'ROOM_MEMBERSHIP_REQUIRED' },
    });
  });
});
