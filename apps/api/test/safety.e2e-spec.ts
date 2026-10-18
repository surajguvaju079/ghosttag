import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { App } from 'supertest/types';
import { io, Socket } from 'socket.io-client';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { IdentityService } from '../src/identity/identity.service';
import { RoomService } from '../src/room/room.service';
import { RateLimitService, RatePolicy } from '../src/safety/rate-limit.service';
import { RetentionRunner } from '../src/retention/retention.runner';
import { RetentionRepository } from '../src/retention/retention.repository';
import { RetentionService } from '../src/retention/retention.service';
import { MessageService } from '../src/message/message.service';

type Identity = { token: string; identityId: string };
interface Message {
  messageId: string;
  code: string;
  text: string;
}
interface Reply {
  ok: boolean;
  data?: { message: Message; replayed: boolean };
  error?: { code: string; statusCode: number; retryAfterMs?: number };
}

describe('Messaging safety + PostgreSQL + Socket.IO', () => {
  let app: INestApplication<App>;
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let owner: Identity;
  let member: Identity;
  let rooms: RoomService;
  let identities: IdentityService;
  let roomId: string;
  let code: string;
  let url: string;
  let rates: RateLimitService;
  let created = false;
  const databaseName = `ghosttag_test_${randomUUID().replaceAll('-', '')}`;
  const sockets = new Set<Socket>();
  const rateProxy = {
    consume: (policy: RatePolicy, identity?: string, peer?: string) =>
      rates.consume(policy, identity, peer),
  };

  beforeAll(async () => {
    await ConfigModule.forRoot({ envFilePath: '.env' });
    const source = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!source)
      throw new Error(
        'Set TEST_DATABASE_URL or DATABASE_URL with CREATEDB permission.',
      );
    admin = new PrismaClient({
      adapter: new PrismaPg({ connectionString: source }),
    });
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const testUrl = new URL(source);
    testUrl.pathname = `/${databaseName}`;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testUrl.toString() }),
    });
    rates = new RateLimitService(new ConfigService());
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RetentionRunner)
      .useValue({})
      .overrideProvider(RateLimitService)
      .useValue(rateProxy)
      .compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}/rooms`;
    rooms = app.get(RoomService);
    identities = app.get(IdentityService);
  }, 60_000);

  beforeEach(async () => {
    // Each test uses a fresh real limiter, with no public reset API or disabled checks.
    rates = new RateLimitService(new ConfigService());
    owner = await identities.createIdentity();
    member = await identities.createIdentity();
    const room = await rooms.createRoom(owner.identityId, {
      vibe: 'DEEP_TALK',
    });
    code = room.code;
    roomId = room.id;
    await rooms.joinRoom(member.identityId, code);
  });
  afterEach(async () => {
    for (const socket of sockets) socket.disconnect();
    sockets.clear();
    jest.restoreAllMocks();
    await prisma.room.deleteMany({
      where: { creatorId: { in: [owner.identityId, member.identityId] } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(
        `DROP DATABASE "${databaseName}" WITH (FORCE)`,
      );
    await admin?.$disconnect();
  });

  function configure(overrides: Record<string, number>) {
    rates = new RateLimitService(new ConfigService(overrides));
  }
  function connect(token = owner.token): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(url, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        timeout: 4000,
      });
      sockets.add(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error: Error & { data?: unknown }) => {
        socket.disconnect();
        reject(error);
      });
    });
  }
  async function ack(
    socket: Socket,
    event: string,
    value: unknown,
  ): Promise<Reply> {
    return (await socket.timeout(4000).emitWithAck(event, value)) as Reply;
  }
  function send(socket: Socket, id = randomUUID(), text = 'Safety fixture') {
    return ack(socket, 'message:send', { code, clientMessageId: id, text });
  }
  async function message(targetRoom = roomId, author = owner.identityId) {
    const membership = await prisma.roomMembership.findUniqueOrThrow({
      where: { userId_roomId: { userId: author, roomId: targetRoom } },
    });
    return prisma.message.create({
      data: {
        roomId: targetRoom,
        membershipId: membership.id,
        text: 'Report fixture',
      },
    });
  }
  function report(
    id: string,
    token = member.token,
    target = code,
    reason = 'SPAM',
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/rooms/${target}/messages/${id}/reports`)
      .auth(token, { type: 'bearer' })
      .send({ reason });
  }
  function cleanup(batchSize = 2, chunks = 1, graceMs = 1000) {
    return new RetentionService(
      app.get(RetentionRepository),
      new ConfigService({
        RETENTION_BATCH_SIZE: batchSize,
        RETENTION_CHUNKS_PER_SWEEP: chunks,
        RETENTION_GRACE_MS: graceMs,
      }),
    );
  }

  it('throttles anonymous identity creation by peer and resets with structured REST errors', async () => {
    configure({
      SAFETY_IDENTITY_CREATE_NETWORK_LIMIT: 2,
      SAFETY_IDENTITY_CREATE_WINDOW_MS: 1000,
    });
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    for (let index = 0; index < 2; index++)
      await request(app.getHttpServer())
        .post('/api/v1/identity')
        .set('X-Forwarded-For', `203.0.113.${index}`)
        .expect(201);
    const limited = await request(app.getHttpServer())
      .post('/api/v1/identity')
      .set('X-Forwarded-For', '198.51.100.99')
      .expect(429)
      .expect('Retry-After', '1');
    expect(limited.body).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      retryAfterMs: 1000,
    });
    now += 1000;
    await request(app.getHttpServer()).post('/api/v1/identity').expect(201);
  });

  it('enforces room creation limits for both identity and network', async () => {
    configure({
      SAFETY_ROOM_CREATE_IDENTITY_LIMIT: 1,
      SAFETY_ROOM_CREATE_NETWORK_LIMIT: 2,
    });
    const create = (token: string) =>
      request(app.getHttpServer())
        .post('/api/v1/rooms')
        .auth(token, { type: 'bearer' })
        .send({ vibe: 'CHAOS' });
    await create(owner.token).expect(201);
    await create(owner.token).expect(429);
    await create(member.token).expect(201);
    const outsider = await identities.createIdentity();
    await create(outsider.token).expect(429);
  });

  it('throttles repeated join attempts even when already ACTIVE', async () => {
    configure({ SAFETY_ROOM_JOIN_IDENTITY_LIMIT: 2 });
    const join = () =>
      request(app.getHttpServer())
        .post(`/api/v1/rooms/${code}/join`)
        .auth(member.token, { type: 'bearer' });
    await join().expect(200);
    await join().expect(200);
    await join().expect(429);
    expect(
      await prisma.roomMembership.count({
        where: { roomId, userId: member.identityId },
      }),
    ).toBe(1);
  });

  it('limits WebSocket attempts by network before credential verification', async () => {
    configure({ SAFETY_WS_CONNECT_NETWORK_LIMIT: 2 });
    await expect(connect('invalid')).rejects.toMatchObject({
      data: { code: 'INVALID_IDENTITY_CREDENTIAL' },
    });
    await expect(connect('invalid')).rejects.toMatchObject({
      data: { code: 'INVALID_IDENTITY_CREDENTIAL' },
    });
    await expect(connect(member.token)).rejects.toMatchObject({
      data: {
        code: 'RATE_LIMITED',
        statusCode: 429,
        retryAfterMs: expect.any(Number) as unknown,
      },
    });
  });

  it('prevents reconnect bypass of identity connection and subscription limits', async () => {
    configure({ SAFETY_WS_CONNECT_IDENTITY_LIMIT: 1 });
    const original = await connect();
    original.disconnect();
    await expect(connect()).rejects.toMatchObject({
      data: { code: 'RATE_LIMITED' },
    });
    configure({ SAFETY_WS_SUBSCRIBE_IDENTITY_LIMIT: 2 });
    const first = await connect();
    expect((await ack(first, 'room:subscribe', { code })).ok).toBe(true);
    expect((await ack(first, 'room:subscribe', { code })).ok).toBe(true);
    first.disconnect();
    const second = await connect();
    expect(await ack(second, 'room:subscribe', { code })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED', statusCode: 429 },
    });
    expect((await ack(second, 'room:unsubscribe', { code })).ok).toBe(true);
  });

  it('enforces concurrent send attempt limits atomically and persists only admitted messages', async () => {
    configure({
      SAFETY_MESSAGE_SEND_IDENTITY_LIMIT: 3,
      SAFETY_MESSAGE_BURST_IDENTITY_LIMIT: 20,
    });
    const socket = await connect();
    const replies = await Promise.all(
      Array.from({ length: 8 }, () => send(socket)),
    );
    expect(replies.filter((reply) => reply.ok)).toHaveLength(3);
    expect(
      replies.filter((reply) => reply.error?.code === 'RATE_LIMITED'),
    ).toHaveLength(5);
    expect(await prisma.message.count({ where: { roomId } })).toBe(3);
    socket.disconnect();
    const reconnected = await connect();
    expect(await send(reconnected)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
  });

  it('restricts new-message frequency while allowing idempotent retries', async () => {
    configure({
      SAFETY_MESSAGE_BURST_IDENTITY_LIMIT: 2,
      SAFETY_MESSAGE_BURST_WINDOW_MS: 10_000,
    });
    const socket = await connect();
    const key = randomUUID();
    expect((await send(socket, key)).ok).toBe(true);
    expect((await send(socket)).ok).toBe(true);
    expect(await send(socket, key)).toMatchObject({
      ok: true,
      data: { replayed: true },
    });
    expect(await send(socket)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(await prisma.message.count({ where: { roomId } })).toBe(2);
  });

  it('accepts private, idempotent reports without returning reporter or database identifiers', async () => {
    const target = await message();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => report(target.publicId).expect(202)),
    );
    for (const response of responses)
      expect(response.body).toEqual({ accepted: true });
    expect(
      await prisma.messageReport.count({ where: { messageId: target.id } }),
    ).toBe(1);
    const stored = await prisma.messageReport.findFirstOrThrow({
      where: { messageId: target.id },
    });
    await report(target.publicId, member.token, code, 'HATE').expect(202);
    expect(
      await prisma.messageReport.findUniqueOrThrow({
        where: { id: stored.id },
      }),
    ).toEqual(stored);
    expect(stored.reason).toBe('SPAM');
    expect(stored).not.toHaveProperty('text');
    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${code}/messages/${target.publicId}/reports`)
      .auth(owner.token, { type: 'bearer' })
      .expect(404);
  });

  it('rate limits reporting attempts', async () => {
    configure({ SAFETY_MESSAGE_REPORT_IDENTITY_LIMIT: 1 });
    const target = await message();
    await report(target.publicId).expect(202);
    await report(target.publicId).expect(429);
  });

  it('denies nonmember, LEFT and invalid-credential reports', async () => {
    const target = await message();
    const outsider = await identities.createIdentity();
    await report(target.publicId, outsider.token).expect(403);
    await rooms.leaveRoom(member.identityId, code);
    await report(target.publicId).expect(403);
    await report(target.publicId, 'invalid').expect(401);
    expect(await prisma.messageReport.count()).toBe(0);
  });

  it('does not reveal cross-room messages through reporting', async () => {
    const other = await rooms.createRoom(owner.identityId, { vibe: 'CHAOS' });
    const target = await message(other.id);
    const foreign = await report(target.publicId).expect(404);
    const unknown = await report('m_' + 'f'.repeat(32)).expect(404);
    expect(foreign.body).toMatchObject({
      code: 'MESSAGE_NOT_FOUND',
      message: 'Message not found',
    });
    expect(unknown.body).toMatchObject({
      code: 'MESSAGE_NOT_FOUND',
      message: 'Message not found',
    });
    expect(await prisma.messageReport.count()).toBe(0);
  });

  it.each(['locked', 'expired'])(
    'denies reporting in an inaccessible %s room',
    async (state) => {
      const target = await message();
      await prisma.room.update({
        where: { id: roomId },
        data:
          state === 'locked'
            ? { lockedUntil: new Date(Date.now() + 60_000) }
            : { expiresAt: new Date(0) },
      });
      await report(target.publicId).expect(state === 'locked' ? 423 : 410);
    },
  );

  it('rejects free-form report content and invalid public IDs', async () => {
    const target = await message();
    await report(target.publicId, member.token, code, 'UNSUPPORTED').expect(
      400,
    );
    await report(target.id).expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${code}/messages/${target.publicId}/reports`)
      .auth(member.token, { type: 'bearer' })
      .send({ reason: 'SPAM', reporterId: owner.identityId })
      .expect(400);
  });

  it('cleans expired content in bounded chunks and resumes through new worker instances', async () => {
    const own = await prisma.roomMembership.findUniqueOrThrow({
      where: { userId_roomId: { userId: owner.identityId, roomId } },
    });
    const reporter = await prisma.roomMembership.findUniqueOrThrow({
      where: { userId_roomId: { userId: member.identityId, roomId } },
    });
    await prisma.message.createMany({
      data: Array.from({ length: 7 }, () => ({
        roomId,
        membershipId: own.id,
        text: 'Expired fixture',
      })),
    });
    const target = await prisma.message.findFirstOrThrow({ where: { roomId } });
    await prisma.messageReport.create({
      data: {
        messageId: target.id,
        reporterMembershipId: reporter.id,
        reason: 'SPAM',
      },
    });
    await prisma.reaction.create({
      data: { membershipId: reporter.id, messageId: target.id, type: 'FIRE' },
    });
    const poll = await prisma.poll.create({
      data: {
        roomId,
        question: 'Fixture',
        optionA: 'A',
        optionB: 'B',
        expiresAt: new Date(0),
      },
    });
    await prisma.pollVote.create({
      data: { pollId: poll.id, membershipId: own.id, option: 'A' },
    });
    await prisma.room.update({
      where: { id: roomId },
      data: { expiresAt: new Date(Date.now() - 7200_000) },
    });
    await expect(cleanup().sweep()).resolves.toEqual({ chunks: 1 });
    expect(await prisma.message.count({ where: { roomId } })).toBe(5);
    expect(await prisma.roomMembership.count({ where: { roomId } })).toBe(2);
    for (
      let attempt = 0;
      attempt < 10 && (await prisma.room.count({ where: { id: roomId } }));
      attempt++
    ) {
      await cleanup().sweep(); // fresh service, same durable PostgreSQL backlog
    }
    expect(await prisma.room.count({ where: { id: roomId } })).toBe(0);
    expect(await prisma.message.count({ where: { roomId } })).toBe(0);
    expect(await prisma.messageReport.count()).toBe(0);
    expect(await prisma.reaction.count()).toBe(0);
    expect(await prisma.poll.count({ where: { roomId } })).toBe(0);
    expect(await prisma.pollVote.count()).toBe(0);
    expect(await prisma.roomMembership.count({ where: { roomId } })).toBe(0);
    expect(
      await prisma.identityCredential.count({
        where: { userId: { in: [owner.identityId, member.identityId] } },
      }),
    ).toBe(2);
    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${code}/messages`)
      .auth(owner.token, { type: 'bearer' })
      .expect(404);
  });

  it('keeps active and grace-period content while rejecting logically expired history immediately', async () => {
    await message();
    expect((await cleanup().sweep()).chunks).toBe(0);
    await prisma.room.update({
      where: { id: roomId },
      data: { expiresAt: new Date(Date.now() - 1200_000) },
    });
    expect((await cleanup(2, 1, 3600_000).sweep()).chunks).toBe(0);
    expect(await prisma.message.count({ where: { roomId } })).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${code}/messages`)
      .auth(owner.token, { type: 'bearer' })
      .expect(410);
  });

  it('skips a room held by another transaction and retries it later', async () => {
    await message();
    await prisma.room.update({
      where: { id: roomId },
      data: { expiresAt: new Date(0) },
    });
    let acquired!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holding = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "rooms" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
      acquired();
      await gate;
    });
    await locked;
    try {
      expect((await cleanup().sweep()).chunks).toBe(0);
    } finally {
      release();
      await holding;
    }
    expect((await cleanup().sweep()).chunks).toBe(1);
  });

  it('does not deliver cached deleted content through a recycled room code', async () => {
    const target = await message();
    await prisma.room.update({
      where: { id: roomId },
      data: { expiresAt: new Date(0) },
    });
    await cleanup(100, 10).sweep();
    const generator = jest
      .spyOn(
        rooms as unknown as { generateRoomCode(): string },
        'generateRoomCode',
      )
      .mockReturnValueOnce(code);
    const replacement = await rooms.createRoom(owner.identityId, {
      vibe: 'CHAOS',
    });
    generator.mockRestore();
    expect(replacement.code).toBe(code);
    const delivered = jest.fn();
    const credential = await prisma.identityCredential.findUniqueOrThrow({
      where: { userId: owner.identityId },
    });
    await app
      .get(MessageService)
      .delivery(credential.tokenHash, code, target.publicId, delivered);
    expect(delivered).not.toHaveBeenCalled();
  });
});
