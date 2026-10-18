import { RetentionRunner } from '../src/retention/retention.runner';
import type { Server } from 'node:http';
import { ConfigModule } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { IdentityService } from '../src/identity/identity.service';
import { MessageGateway } from '../src/message/message.gateway';
import { MessageRepository } from '../src/message/message.repository';
import { RoomService } from '../src/room/room.service';

interface PublicMessage {
  messageId: string;
  code: string;
  text: string;
  createdAt: string;
  author: { participantId: string; ghostName: string; ghostAvatar: string };
}
interface Reply<T> {
  ok: boolean;
  data: T;
  error?: { statusCode: number; code: string; message: string };
}
interface SendData {
  message: PublicMessage;
  replayed: boolean;
  clientMessageId: string;
}
interface Subscription {
  code: string;
  subscribed: boolean;
  participant: { participantId: string };
}
type Identity = { token: string; identityId: string };

function event<T>(socket: Socket, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out waiting for ${name}`));
    }, 4000);
    const listener = (value: T) => {
      clearTimeout(timeout);
      resolve(value);
    };
    socket.once(name, listener);
  });
}

async function ack<T>(
  socket: Socket,
  name: string,
  value: unknown,
): Promise<Reply<T>> {
  return (await socket.timeout(4000).emitWithAck(name, value)) as Reply<T>;
}

describe('Real-time messaging + PostgreSQL', () => {
  let app: INestApplication<App>;
  let admin: PrismaClient;
  let prisma: PrismaClient;
  let rooms: RoomService;
  let identities: IdentityService;
  let owner: Identity;
  let member: Identity;
  let code: string;
  let roomId: string;
  let url: string;
  let created = false;
  let isolatedDatabaseUrl: string;
  const clients = new Set<Socket>();
  const databaseName = `ghosttag_test_${randomUUID().replaceAll('-', '')}`;

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
    isolatedDatabaseUrl = testUrl.toString();
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      stdio: 'pipe',
    });
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testUrl.toString() }),
    });
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RetentionRunner)
      .useValue({})
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}/rooms`;
    rooms = app.get(RoomService);
    identities = app.get(IdentityService);
  }, 60_000);

  beforeEach(async () => {
    owner = await identities.createIdentity();
    member = await identities.createIdentity();
    const room = await rooms.createRoom(owner.identityId, {
      vibe: 'DEEP_TALK',
    });
    code = room.code;
    roomId = room.id;
    await rooms.joinRoom(member.identityId, code);
  });

  afterEach(() => {
    for (const socket of clients) socket.disconnect();
    clients.clear();
    jest.restoreAllMocks();
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

  function connect(token: unknown = owner.token): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(url, {
        transports: ['websocket'],
        auth: { token },
        forceNew: true,
        reconnection: false,
        timeout: 4000,
      });
      clients.add(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error: Error & { data?: unknown }) => {
        socket.disconnect();
        reject(error);
      });
    });
  }
  async function subscribe(socket: Socket, target = code) {
    return ack<Subscription>(socket, 'room:subscribe', { code: target });
  }
  async function send(
    socket: Socket,
    text = 'Hello room',
    clientMessageId = randomUUID(),
    target = code,
  ) {
    return ack<SendData>(socket, 'message:send', {
      code: target,
      text,
      clientMessageId,
    });
  }
  function history(token = owner.token, target = code) {
    return request(app.getHttpServer())
      .get(`/api/v1/rooms/${target}/messages`)
      .auth(token, { type: 'bearer' });
  }

  it.each([
    [null, 'AUTHENTICATION_REQUIRED'],
    ['invalid', 'INVALID_IDENTITY_CREDENTIAL'],
  ])('rejects invalid connection credentials', async (token, errorCode) => {
    await expect(connect(token)).rejects.toMatchObject({
      data: { code: errorCode, statusCode: 401 },
    });
  });

  it.each(['revoked', 'expired'])(
    'rejects %s credentials at connection',
    async (state) => {
      await prisma.identityCredential.update({
        where: { userId: owner.identityId },
        data:
          state === 'revoked'
            ? { revokedAt: new Date() }
            : { expiresAt: new Date(0) },
      });
      await expect(connect()).rejects.toMatchObject({
        data: {
          code: state === 'revoked' ? 'IDENTITY_REVOKED' : 'IDENTITY_EXPIRED',
        },
      });
    },
  );

  it('authenticates and subscribes using a normalized public code', async () => {
    const socket = await connect();
    const reply = await subscribe(socket, ` ${code.toLowerCase()} `);
    expect(reply).toMatchObject({
      ok: true,
      data: {
        code,
        subscribed: true,
        participant: {
          participantId: expect.stringMatching(/^p_[a-f0-9]{32}$/) as unknown,
        },
      },
    });
  });

  it('denies nonmembers, LEFT memberships and spoofed identity fields', async () => {
    const outsider = await identities.createIdentity();
    const socket = await connect(outsider.token);
    expect(await subscribe(socket)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_MEMBERSHIP_REQUIRED' },
    });
    expect(await send(socket)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_MEMBERSHIP_REQUIRED' },
    });
    expect(
      await ack(socket, 'room:subscribe', { code, userId: owner.identityId }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_MESSAGE_PAYLOAD' } });
    await rooms.leaveRoom(member.identityId, code);
    const left = await connect(member.token);
    expect(await subscribe(left)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_MEMBERSHIP_INACTIVE' },
    });
  });

  it('commits before broadcasting and exposes only public identifiers', async () => {
    const sender = await connect();
    const receiver = await connect(member.token);
    await subscribe(receiver);
    const received = event<PublicMessage>(receiver, 'message:created');
    const result = await send(sender);
    expect(result.ok).toBe(true);
    const pushed = await received;
    expect(pushed).toEqual(result.data.message);
    expect(pushed).toEqual({
      messageId: expect.stringMatching(/^m_[a-f0-9]{32}$/) as unknown,
      code,
      text: 'Hello room',
      createdAt: expect.any(String) as unknown,
      author: {
        participantId: expect.stringMatching(/^p_[a-f0-9]{32}$/) as unknown,
        ghostName: expect.any(String) as unknown,
        ghostAvatar: expect.any(String) as unknown,
      },
    });
    const stored = await prisma.message.findUniqueOrThrow({
      where: { publicId: pushed.messageId },
      include: { membership: true },
    });
    expect(stored.text).toBe(pushed.text);
    expect(stored.membership.userId).toBe(owner.identityId);
    expect(stored.membership.publicId).toBe(pushed.author.participantId);
    const publicJson = JSON.stringify(pushed);
    for (const hidden of [
      roomId,
      owner.identityId,
      stored.id,
      stored.membershipId,
      owner.token,
    ])
      expect(publicJson).not.toContain(hidden);
  });

  it('distinguishes identical ghost names and isolates the same identity across rooms', async () => {
    await prisma.roomMembership.updateMany({
      where: { roomId },
      data: { ghostName: 'Same Ghost', ghostAvatar: 'ghost' },
    });
    const first = await connect();
    const second = await connect(member.token);
    const a = await send(first);
    const b = await send(second);
    expect(a.data.message.author.ghostName).toBe(
      b.data.message.author.ghostName,
    );
    expect(a.data.message.author.participantId).not.toBe(
      b.data.message.author.participantId,
    );
    const other = await rooms.createRoom(owner.identityId, { vibe: 'CHAOS' });
    const c = await send(first, 'Other room', randomUUID(), other.code);
    expect(c.data.message.author.participantId).not.toBe(
      a.data.message.author.participantId,
    );
  });

  it('makes concurrent retries idempotent and rejects a conflicting payload', async () => {
    const socket = await connect();
    const retryKey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => send(socket, 'Retry safely', retryKey)),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(
      new Set(results.map((result) => result.data.message.messageId)).size,
    ).toBe(1);
    expect(results.filter((result) => !result.data.replayed)).toHaveLength(1);
    expect(await prisma.message.count({ where: { roomId } })).toBe(1);
    expect(await send(socket, 'Changed text', retryKey)).toMatchObject({
      ok: false,
      error: { code: 'IDEMPOTENCY_CONFLICT', statusCode: 409 },
    });
    const another = await connect(member.token);
    expect((await send(another, 'Independent retry key', retryKey)).ok).toBe(
      true,
    );
  });

  it('does not rebroadcast retry acknowledgements', async () => {
    const sender = await connect();
    const receiver = await connect(member.token);
    await subscribe(receiver);
    const observed: PublicMessage[] = [];
    receiver.on('message:created', (value: PublicMessage) =>
      observed.push(value),
    );
    const received = event<PublicMessage>(receiver, 'message:created');
    const key = randomUUID();
    await send(sender, 'Once', key);
    await received;
    expect((await send(sender, 'Once', key)).data.replayed).toBe(true);
    await ack(receiver, 'room:unsubscribe', { code }); // round-trip barrier on receiver
    expect(observed).toHaveLength(1);
  });

  it.each(['', '   ', 'x'.repeat(2001), 'null\u0000byte', '\ud800'])(
    'rejects invalid message text',
    async (text) => {
      const socket = await connect();
      expect(await send(socket, text)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_MESSAGE_PAYLOAD' },
      });
      expect(await prisma.message.count({ where: { roomId } })).toBe(0);
    },
  );

  it('accepts the 2000-character boundary and rejects missing retry keys', async () => {
    const socket = await connect();
    expect((await send(socket, 'x'.repeat(2000))).ok).toBe(true);
    expect(
      await ack(socket, 'message:send', { code, text: 'No key' }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_MESSAGE_PAYLOAD' } });
  });

  it('paginates history deterministically without losing PostgreSQL sub-millisecond timestamps', async () => {
    const socket = await connect();
    const sent: PublicMessage[] = [];
    for (let index = 0; index < 5; index++)
      sent.push((await send(socket, `Message ${index}`)).data.message);
    // Two timestamps in the same millisecond plus exact ties exercise the DB cursor.
    for (let index = 0; index < sent.length; index++) {
      const micros = index < 2 ? 100 : 200;
      await prisma.$executeRaw`UPDATE "messages" SET "createdAt" = TIMESTAMPTZ '2020-01-01 00:00:00.123000+00' + ${micros} * INTERVAL '1 microsecond' WHERE "publicId" = ${sent[index].messageId}`;
    }
    const all: PublicMessage[] = [];
    let before: string | null = null;
    for (let page = 0; page < 3; page++) {
      const response = await history()
        .query({ limit: 2, ...(before ? { before } : {}) })
        .expect(200)
        .expect('Cache-Control', 'no-store');
      const body = response.body as {
        messages: PublicMessage[];
        nextCursor: string | null;
      };
      all.push(...body.messages);
      before = body.nextCursor;
      expect(body.messages).toHaveLength(page < 2 ? 2 : 1);
    }
    expect(before).toBeNull();
    const expected = [
      ...sent.slice(2).sort((a, b) => b.messageId.localeCompare(a.messageId)),
      ...sent
        .slice(0, 2)
        .sort((a, b) => b.messageId.localeCompare(a.messageId)),
    ];
    expect(all.map((value) => value.messageId)).toEqual(
      expected.map((value) => value.messageId),
    );
    expect(new Set(all.map((value) => value.messageId)).size).toBe(5);
  });

  it('rejects cross-room cursors, invalid pagination, and nonmember history', async () => {
    const socket = await connect();
    const first = await send(socket);
    const other = await rooms.createRoom(owner.identityId, { vibe: 'CHAOS' });
    const response = await history(owner.token, other.code)
      .query({ before: first.data.message.messageId })
      .expect(400);
    expect(response.body).toMatchObject({ code: 'INVALID_CURSOR' });
    await history().query({ limit: 101 }).expect(400);
    await history().query({ before: randomUUID() }).expect(400);
    const outsider = await identities.createIdentity();
    await history(outsider.token).expect(403);
    await history('invalid').expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/rooms/${code}/messages`)
      .expect(401);
  });

  it('never pushes messages across room subscriptions or after unsubscribe', async () => {
    const sender = await connect();
    const receiver = await connect(member.token);
    const other = await rooms.createRoom(member.identityId, { vibe: 'CHAOS' });
    await subscribe(receiver, other.code);
    const received: PublicMessage[] = [];
    receiver.on('message:created', (value: PublicMessage) =>
      received.push(value),
    );
    await send(sender);
    await ack(receiver, 'room:unsubscribe', { code: other.code });
    expect(received).toHaveLength(0);
    await subscribe(receiver);
    await ack(receiver, 'room:unsubscribe', { code });
    await send(sender);
    await ack(receiver, 'room:unsubscribe', { code });
    expect(received).toHaveLength(0);
  });

  it('invalidates a leave immediately, preserves participant identity, and requires resubscription', async () => {
    const sender = await connect();
    const receiver = await connect(member.token);
    const original = await subscribe(receiver);
    const invalidation = event<{ code: string }>(receiver, 'room:invalidated');
    await rooms.leaveRoom(member.identityId, code);
    expect((await invalidation).code).toBe(code);
    expect(await send(receiver)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_MEMBERSHIP_INACTIVE' },
    });
    await history(member.token).expect(403);
    await rooms.joinRoom(member.identityId, code);
    const observed: PublicMessage[] = [];
    receiver.on('message:created', (value: PublicMessage) =>
      observed.push(value),
    );
    await send(sender, 'Not resubscribed');
    const next = await subscribe(receiver);
    expect(next.data.participant.participantId).toBe(
      original.data.participant.participantId,
    );
    expect(observed).toHaveLength(0);
    const received = event<PublicMessage>(receiver, 'message:created');
    await send(sender, 'Resubscribed');
    await received;
    await history(member.token).expect(200);
  });

  it.each(['locked', 'expired'])(
    'enforces room %s state for events, delivery, and REST',
    async (state) => {
      const socket = await connect();
      await subscribe(socket);
      const invalidation = event<{ error: { code: string } }>(
        socket,
        'room:invalidated',
      );
      await prisma.room.update({
        where: { id: roomId },
        data:
          state === 'locked'
            ? { lockedUntil: new Date(Date.now() + 60_000) }
            : { expiresAt: new Date(0) },
      });
      const expected = state === 'locked' ? 'ROOM_LOCKED' : 'ROOM_EXPIRED';
      expect(await send(socket)).toMatchObject({
        ok: false,
        error: { code: expected },
      });
      expect(await subscribe(socket)).toMatchObject({
        ok: false,
        error: { code: expected },
      });
      await app.get(MessageGateway).sweep();
      expect((await invalidation).error.code).toBe(expected);
      await history().expect(state === 'locked' ? 423 : 410);
      expect(await prisma.message.count({ where: { roomId } })).toBe(0);
    },
  );

  it.each(['revoked', 'expired'])(
    'blocks delivery after a recipient credential is %s, without relying on sweep',
    async (state) => {
      const sender = await connect();
      const receiver = await connect(member.token);
      await subscribe(receiver);
      const observed: PublicMessage[] = [];
      receiver.on('message:created', (value: PublicMessage) =>
        observed.push(value),
      );
      const disconnected = event(receiver, 'disconnect');
      await prisma.identityCredential.update({
        where: { userId: member.identityId },
        data:
          state === 'revoked'
            ? { revokedAt: new Date() }
            : { expiresAt: new Date(0) },
      });
      expect((await send(sender)).ok).toBe(true);
      await disconnected;
      expect(observed).toHaveLength(0);
      await history(member.token).expect(401);
      await expect(connect(member.token)).rejects.toMatchObject({
        data: {
          code: state === 'revoked' ? 'IDENTITY_REVOKED' : 'IDENTITY_EXPIRED',
        },
      });
    },
  );

  it('invalidates idle sessions during the sweep without incoming messages', async () => {
    const socket = await connect();
    await subscribe(socket);
    const invalidated = event<{ error: { code: string } }>(
      socket,
      'session:invalidated',
    );
    const disconnected = event(socket, 'disconnect');
    await prisma.identityCredential.update({
      where: { userId: owner.identityId },
      data: { revokedAt: new Date() },
    });
    await app.get(MessageGateway).sweep();
    expect((await invalidated).error.code).toBe('IDENTITY_REVOKED');
    await disconnected;
  });

  it('rechecks the sender credential after connection and rejects the send', async () => {
    const socket = await connect();
    const invalidated = event<{ error: { code: string } }>(
      socket,
      'session:invalidated',
    );
    const disconnected = event(socket, 'disconnect');
    await prisma.identityCredential.update({
      where: { userId: owner.identityId },
      data: { expiresAt: new Date(0) },
    });
    socket.emit('message:send', {
      code,
      text: 'Must not persist',
      clientMessageId: randomUUID(),
    });
    expect((await invalidated).error.code).toBe('IDENTITY_EXPIRED');
    await disconnected;
    expect(await prisma.message.count({ where: { roomId } })).toBe(0);
  });

  it('reauthenticates reconnects and starts without subscriptions', async () => {
    const sender = await connect();
    const old = await connect(member.token);
    const original = await subscribe(old);
    old.disconnect();
    const receiver = await connect(member.token);
    const observed: PublicMessage[] = [];
    receiver.on('message:created', (value: PublicMessage) =>
      observed.push(value),
    );
    await send(sender);
    const subscription = await subscribe(receiver);
    expect(subscription.data.participant.participantId).toBe(
      original.data.participant.participantId,
    );
    expect(observed).toHaveLength(0);
  });

  it('orders concurrent sends against leave and rejects retries after leave', async () => {
    const socket = await connect(member.token);
    const key = randomUUID();
    const [result] = await Promise.all([
      send(socket, 'Racing leave', key),
      rooms.leaveRoom(member.identityId, code),
    ]);
    const count = await prisma.message.count({ where: { roomId } });
    expect(count).toBe(result.ok ? 1 : 0);
    if (!result.ok) expect(result.error?.code).toBe('ROOM_MEMBERSHIP_INACTIVE');
    expect(await send(socket, 'Racing leave', key)).toMatchObject({
      ok: false,
      error: { code: 'ROOM_MEMBERSHIP_INACTIVE' },
    });
  });

  it('rolls back failed persistence and broadcasts nothing', async () => {
    const sender = await connect();
    const receiver = await connect(member.token);
    await subscribe(receiver);
    const observed: PublicMessage[] = [];
    receiver.on('message:created', (value: PublicMessage) =>
      observed.push(value),
    );
    jest
      .spyOn(app.get(MessageRepository), 'create')
      .mockRejectedValueOnce(new Error('private SQL failure'));
    expect(await send(sender)).toMatchObject({
      ok: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    await ack(receiver, 'room:unsubscribe', { code });
    expect(observed).toHaveLength(0);
    expect(await prisma.message.count({ where: { roomId } })).toBe(0);
  });

  it('backfills independent public IDs and nullable retry keys without changing legacy message data', async () => {
    const membership = await prisma.roomMembership.findUniqueOrThrow({
      where: { userId_roomId: { userId: owner.identityId, roomId } },
    });
    const legacy = await prisma.message.create({
      data: { roomId, membershipId: membership.id, text: 'Legacy fixture' },
    });
    // Recreate the pre-migration columns only in this disposable test database.
    await prisma.$executeRaw`ALTER TABLE "messages" DROP COLUMN "publicId", DROP COLUMN "clientMessageId"`;
    await prisma.$executeRaw`ALTER TABLE "room_memberships" DROP COLUMN "publicId"`;
    execFileSync(
      'pnpm',
      [
        'exec',
        'prisma',
        'db',
        'execute',
        '--file',
        'prisma/migrations/20261018000000_message_public_identifiers/migration.sql',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl },
        stdio: 'pipe',
      },
    );
    const backfilled = await prisma.message.findUniqueOrThrow({
      where: { id: legacy.id },
      include: { membership: true },
    });
    expect(backfilled).toMatchObject({
      id: legacy.id,
      roomId,
      membershipId: membership.id,
      text: legacy.text,
      createdAt: legacy.createdAt,
      clientMessageId: null,
    });
    expect(backfilled.publicId).toMatch(/^m_[a-f0-9]{32}$/);
    expect(backfilled.membership.publicId).toMatch(/^p_[a-f0-9]{32}$/);
    expect(backfilled.publicId.slice(2)).not.toBe(
      legacy.id.replaceAll('-', ''),
    );
    expect(backfilled.membership.publicId.slice(2)).not.toBe(
      membership.id.replaceAll('-', ''),
    );
  }, 30_000);
});
