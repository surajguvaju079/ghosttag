import { ConfigModule } from '@nestjs/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { RoomController } from '../src/room/room.controller';
import { RoomService } from '../src/room/room.service';
import { IdentityService } from '../src/identity/identity.service';
import { AnonymousIdentityGuard } from '../src/common/auth/anonymous-identity.guard';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/database/prisma/prisma.service';

describe('Room membership HTTP + PostgreSQL integration', () => {
  let app: INestApplication<App>;
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let identities: IdentityService;
  let owner: { token: string; identityId: string };
  let member: { token: string; identityId: string };
  let code: string;
  let roomId: string;
  let databaseCreated = false;
  const databaseName = `ghosttag_test_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    await ConfigModule.forRoot({ envFilePath: '.env' });
    const sourceUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!sourceUrl)
      throw new Error(
        'Set TEST_DATABASE_URL (or DATABASE_URL) to a PostgreSQL role with CREATEDB for isolated integration tests.',
      );
    admin = new PrismaClient({
      adapter: new PrismaPg({ connectionString: sourceUrl }),
    });
    // The generated name contains only a fixed prefix and random hex digits.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    const testUrl = new URL(sourceUrl);
    testUrl.pathname = `/${databaseName}`;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testUrl.toString() }),
    });
    const module = await Test.createTestingModule({
      controllers: [RoomController],
      providers: [
        RoomService,
        IdentityService,
        AnonymousIdentityGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    identities = module.get(IdentityService);
  }, 60_000);

  beforeEach(async () => {
    owner = await identities.createIdentity();
    member = await identities.createIdentity();
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms')
      .auth(owner.token, { type: 'bearer' })
      .send({ vibe: 'DEEP_TALK', name: 'Test room' })
      .expect(201);
    const created = response.body as { code: string };
    code = created.code;
    roomId = (await prisma.room.findUniqueOrThrow({ where: { code } })).id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (databaseCreated) {
      await admin.$executeRawUnsafe(
        `DROP DATABASE "${databaseName}" WITH (FORCE)`,
      );
    }
    await admin?.$disconnect();
  });

  function post(
    action: 'join' | 'leave',
    token = member.token,
    publicCode = code,
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/rooms/${encodeURIComponent(publicCode)}/${action}`)
      .auth(token, { type: 'bearer' });
  }
  function membership(userId = member.identityId) {
    return prisma.roomMembership.findUniqueOrThrow({
      where: { userId_roomId: { userId, roomId } },
    });
  }
  async function fillTo49() {
    await prisma.anonymousUser.createMany({
      data: Array.from({ length: 48 }, () => ({ id: randomUUID() })),
    });
    const users = await prisma.anonymousUser.findMany({
      where: {
        memberships: { none: {} },
        NOT: { id: { in: [owner.identityId, member.identityId] } },
      },
      take: 48,
    });
    await prisma.roomMembership.createMany({
      data: users.map((user) => ({
        roomId,
        userId: user.id,
        ghostName: 'Test Ghost',
        ghostAvatar: 'ghost',
      })),
    });
  }

  it('creates an ACTIVE OWNER with a 24 hour room lifetime', async () => {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(room.expiresAt.getTime() - room.createdAt.getTime()).toBe(
      86_400_000,
    );
    expect(await membership(owner.identityId)).toMatchObject({
      status: 'ACTIVE',
      role: 'OWNER',
      leftAt: null,
    });
  });

  it('joins a normalized room code and returns exactly the public contract', async () => {
    const response = await post(
      'join',
      member.token,
      ` ${code.toLowerCase()} `,
    ).expect(200);
    expect(response.body).toEqual({
      room: {
        code,
        vibe: 'DEEP_TALK',
        name: 'Test room',
        expiresAt: expect.any(String) as unknown,
      },
      membership: {
        ghostName: expect.any(String) as unknown,
        ghostAvatar: expect.any(String) as unknown,
        role: 'MEMBER',
      },
    });
    expect(await membership()).toMatchObject({
      status: 'ACTIVE',
      role: 'MEMBER',
    });
  });

  it('duplicate joins return the same membership without inserting rows', async () => {
    const first = await post('join').expect(200);
    const second = await post('join').expect(200);
    expect(second.body).toEqual(first.body);
    expect(
      await prisma.roomMembership.count({
        where: { roomId, userId: member.identityId },
      }),
    ).toBe(1);
  });

  it.each(['MEMBER', 'OWNER'] as const)(
    'leaves and rejoins preserving %s role, identity and joinedAt',
    async (role) => {
      const identity = role === 'OWNER' ? owner : member;
      await post('join', identity.token).expect(200);
      const before = await membership(identity.identityId);
      await post('leave', identity.token).expect(204).expect('');
      const left = await membership(identity.identityId);
      expect(left).toMatchObject({
        status: 'LEFT',
        role,
        ghostName: before.ghostName,
        ghostAvatar: before.ghostAvatar,
      });
      expect(left.leftAt).toBeInstanceOf(Date);
      expect(await prisma.room.count({ where: { id: roomId } })).toBe(1);
      await post('leave', identity.token).expect(204);
      expect((await membership(identity.identityId)).leftAt).toEqual(
        left.leftAt,
      );
      await post('join', identity.token).expect(200);
      expect(await membership(identity.identityId)).toEqual({
        ...before,
        status: 'ACTIVE',
        leftAt: null,
      });
    },
  );

  it('rejects leave for an identity that never joined', async () => {
    const response = await post('leave').expect(403);
    expect(response.body).toMatchObject({ code: 'ROOM_MEMBERSHIP_REQUIRED' });
  });

  describe.each(['join', 'leave'] as const)('%s errors', (action) => {
    it('returns structured 404 for unknown code', async () => {
      const response = await post(action, member.token, 'UNKNOWN').expect(404);
      expect(response.body).toMatchObject({
        code: 'ROOM_NOT_FOUND',
        statusCode: 404,
        path: '/api/v1/rooms/UNKNOWN/' + action,
        timestamp: expect.any(String) as unknown,
        requestId: expect.any(String) as unknown,
      });
    });
    it('rejects expiration even with ACTIVE persisted status, before checking locks', async () => {
      await prisma.room.update({
        where: { id: roomId },
        data: {
          expiresAt: new Date(0),
          lockedUntil: new Date(Date.now() + 60_000),
        },
      });
      const response = await post(action).expect(410);
      expect(response.body).toMatchObject({ code: 'ROOM_EXPIRED' });
    });
    it('rejects a temporarily locked room', async () => {
      await prisma.room.update({
        where: { id: roomId },
        data: { lockedUntil: new Date(Date.now() + 60_000) },
      });
      const response = await post(action).expect(423);
      expect(response.body).toMatchObject({ code: 'ROOM_LOCKED' });
    });
    it.each([
      [undefined, 'AUTHENTICATION_REQUIRED'],
      ['invalid', 'INVALID_IDENTITY_CREDENTIAL'],
    ])('requires a valid identity (%s)', async (token, errorCode) => {
      const req = request(app.getHttpServer()).post(
        `/api/v1/rooms/${code}/${action}`,
      );
      if (token) req.auth(token, { type: 'bearer' });
      const response = await req.expect(401);
      expect(response.body).toMatchObject({ code: errorCode });
    });
    it.each(['revoked', 'expired'])('rejects %s credentials', async (state) => {
      await prisma.identityCredential.update({
        where: { userId: member.identityId },
        data:
          state === 'revoked'
            ? { revokedAt: new Date() }
            : { expiresAt: new Date(0) },
      });
      const response = await post(action).expect(401);
      expect(response.body).toMatchObject({
        code: state === 'revoked' ? 'IDENTITY_REVOKED' : 'IDENTITY_EXPIRED',
      });
    });
  });

  it('allows joining after a temporary lock elapsed', async () => {
    await prisma.room.update({
      where: { id: roomId },
      data: { lockedUntil: new Date(0) },
    });
    await post('join').expect(200);
  });

  it('serializes competing joins for the final slot and permits duplicates at capacity', async () => {
    await fillTo49();
    const contenders = await Promise.all(
      Array.from({ length: 10 }, () => identities.createIdentity()),
    );
    const results = await Promise.all(
      contenders.map((identity) => post('join', identity.token)),
    );
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(9);
    for (const result of results.filter((result) => result.status === 409)) {
      expect(result.body).toMatchObject({ code: 'ROOM_FULL' });
    }
    expect(
      await prisma.roomMembership.count({
        where: { roomId, status: 'ACTIVE' },
      }),
    ).toBe(50);
    await post('join', owner.token).expect(200);
    await post('join').expect(409);
    await post('leave', owner.token).expect(204);
    await post('join').expect(200);
    await post('join', owner.token).expect(409); // LEFT owners also consume a slot on rejoin.
  });

  it('serializes simultaneous first joins from the same identity', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => post('join')),
    );
    expect(results.every((result) => result.status === 200)).toBe(true);
    for (const result of results) expect(result.body).toEqual(results[0].body);
    expect(
      await prisma.roomMembership.count({
        where: { roomId, userId: member.identityId },
      }),
    ).toBe(1);
  });

  it('serializes simultaneous reactivation and leave requests', async () => {
    await post('join').expect(200);
    const before = await membership();
    const leaves = await Promise.all(
      Array.from({ length: 5 }, () => post('leave')),
    );
    expect(leaves.every((result) => result.status === 204)).toBe(true);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('join')),
    );
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(await membership()).toEqual(before);
  });
});
