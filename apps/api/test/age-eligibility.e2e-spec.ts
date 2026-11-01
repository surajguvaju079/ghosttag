import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { IdentityService } from '../src/identity/identity.service';
import { AGE_POLICY_VERSION } from '../src/identity/age-eligibility.service';
import { RoomService } from '../src/room/room.service';
import { RetentionRunner } from '../src/retention/retention.runner';
import { MessageGateway } from '../src/message/message.gateway';
import { MessageService } from '../src/message/message.service';

type Identity = { token: string; identityId: string };
type Status = {
  ageEligibility: {
    status: string;
    policyVersion: string;
    assessedAt: string | null;
    method: string | null;
  };
  socialAccessEnabled: boolean;
};
describe('Age eligibility REST + PostgreSQL + Socket.IO', () => {
  let app: INestApplication<App>, admin: PrismaClient, prisma: PrismaClient;
  let rooms: RoomService, identities: IdentityService, config: ConfigService;
  let created = false;
  let url: string;
  let identity: Identity, code: string;
  const clients = new Set<Socket>();
  const databaseName = `ghosttag_test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    process.env.SOCIAL_ACCESS_ENABLED = 'true';
    process.env.AGE_POLICY_VERSION = AGE_POLICY_VERSION;
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
    config = app.get(ConfigService);
    identities = app.get(IdentityService);
  }, 60_000);

  beforeEach(async () => {
    config.set('SOCIAL_ACCESS_ENABLED', 'true');
    config.set('AGE_POLICY_VERSION', AGE_POLICY_VERSION);
    identity = await identities.createIdentity();
    const room = await rooms.createRoom(identity.identityId, {
      vibe: 'DEEP_TALK',
    });
    code = room.code;
  });
  afterEach(() => {
    for (const socket of clients) socket.disconnect();
    clients.clear();
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
  function assess(dateOfBirth: string, token = identity.token) {
    return request(app.getHttpServer())
      .post('/api/v1/identity/age-eligibility')
      .auth(token, { type: 'bearer' })
      .send({ dateOfBirth });
  }
  function status() {
    return request(app.getHttpServer())
      .get('/api/v1/identity/me')
      .auth(identity.token, { type: 'bearer' });
  }
  function connect() {
    return new Promise<Socket>((resolve, reject) => {
      const socket = io(url, {
        transports: ['websocket'],
        auth: { token: identity.token },
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
  it('keeps identity creation/status accessible, with explicit unknown eligibility', async () => {
    await request(app.getHttpServer()).post('/api/v1/identity').expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/identity/age-eligibility')
      .send({ dateOfBirth: '2000-01-01' })
      .expect(401);
    const response = await status()
      .expect(200)
      .expect('Cache-Control', 'no-store');
    expect(response.body).toEqual({
      identityId: identity.identityId,
      ageEligibility: {
        status: 'REQUIRED',
        method: null,
        assessedAt: null,
        policyVersion: AGE_POLICY_VERSION,
      },
      socialAccessEnabled: true,
    });
  });
  it('stores only assessment metadata and preserves existing memberships', async () => {
    const before = await prisma.roomMembership.findMany({
      where: { userId: identity.identityId },
    });
    const response = await assess('2000-01-01')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    const body = response.body as Status;
    expect(body.ageEligibility.status).toBe('ELIGIBLE');
    expect(JSON.stringify(body)).not.toContain('2000-01-01');
    const record = await prisma.ageEligibility.findUniqueOrThrow({
      where: { userId: identity.identityId },
    });
    expect(Object.keys(record).sort()).toEqual(
      ['userId', 'result', 'method', 'assessedAt', 'policyVersion'].sort(),
    );
    expect(
      await prisma.roomMembership.findMany({
        where: { userId: identity.identityId },
      }),
    ).toEqual(before);
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .auth(identity.token, { type: 'bearer' })
      .expect(200);
  });
  it('rejects invalid/future dates without persisting an assessment or echoing the value', async () => {
    for (const birth of ['invalid', '2025-02-29', '9999-01-01']) {
      const response = await assess(birth).expect(400);
      expect(JSON.stringify(response.body)).not.toContain(birth);
    }
    expect(
      await prisma.ageEligibility.count({
        where: { userId: identity.identityId },
      }),
    ).toBe(0);
  });
  it('keeps an ineligible result immutable and repeated valid requests idempotent', async () => {
    const first = (await assess('2020-01-01').expect(200)).body as Status;
    const next = (await assess('2000-01-01').expect(200)).body as Status;
    expect(next).toEqual(first);
    expect(next.ageEligibility.status).toBe('INELIGIBLE');
    expect((await status()).body).toMatchObject({
      ageEligibility: { status: 'INELIGIBLE' },
    });
  });
  it('serializes conflicting concurrent assessments into exactly one result', async () => {
    const [a, b] = await Promise.all([
      assess('2000-01-01').expect(200),
      assess('2020-01-01').expect(200),
    ]);
    expect(a.body).toEqual(b.body);
    expect(
      await prisma.ageEligibility.count({
        where: { userId: identity.identityId },
      }),
    ).toBe(1);
  });
  it.each(['REQUIRED', 'INELIGIBLE', 'OLD_POLICY'])(
    'enforces %s before all room/message REST operations and socket connections',
    async (state) => {
      if (state !== 'REQUIRED')
        await prisma.ageEligibility.create({
          data: {
            userId: identity.identityId,
            result: state === 'INELIGIBLE' ? 'INELIGIBLE' : 'ELIGIBLE',
            policyVersion:
              state === 'OLD_POLICY' ? 'older' : AGE_POLICY_VERSION,
          },
        });
      const expected =
        state === 'INELIGIBLE' ? 'AGE_INELIGIBLE' : 'AGE_SCREENING_REQUIRED';
      for (const path of [
        '',
        `/${code}`,
        `/${code}/members`,
        `/${code}/membership`,
        `/${code}/messages`,
      ]) {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/rooms${path}`)
          .auth(identity.token, { type: 'bearer' })
          .expect(403);
        expect(response.body).toMatchObject({ code: expected });
      }
      for (const path of [
        '',
        `/${code}/join`,
        `/${code}/leave`,
        `/${code}/messages/m_${'a'.repeat(32)}/reports`,
      ]) {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/rooms${path}`)
          .auth(identity.token, { type: 'bearer' })
          .send({})
          .expect(403);
        expect(response.body).toMatchObject({ code: expected });
      }
      await expect(connect()).rejects.toMatchObject({
        data: { statusCode: 403, code: expected },
      });
    },
  );
  it('requires rescreening for a policy change and replaces only the assessment record', async () => {
    await assess('2000-01-01').expect(200);
    config.set('AGE_POLICY_VERSION', '18-plus-v2');
    expect((await status()).body).toMatchObject({
      ageEligibility: { status: 'REQUIRED', policyVersion: '18-plus-v2' },
    });
    expect(
      ((await assess('2020-01-01')).body as Status).ageEligibility.status,
    ).toBe('INELIGIBLE');
    expect(
      await prisma.ageEligibility.count({
        where: { userId: identity.identityId },
      }),
    ).toBe(1);
  });
  it('gates eligible identities when rollout is disabled but permits status/assessment', async () => {
    await assess('2000-01-01').expect(200);
    config.set('SOCIAL_ACCESS_ENABLED', 'false');
    await status().expect(200);
    expect(
      ((await assess('2000-01-01').expect(200)).body as Status)
        .socialAccessEnabled,
    ).toBe(false);
    await request(app.getHttpServer())
      .get('/api/v1/rooms')
      .auth(identity.token, { type: 'bearer' })
      .expect(503);
    await expect(connect()).rejects.toMatchObject({
      data: { code: 'SOCIAL_ACCESS_DISABLED', statusCode: 503 },
    });
  });
  it('enforces assessment limits with a retry deadline', async () => {
    for (let i = 0; i < 5; i++) await assess('2000-01-01').expect(200);
    const response = await assess('2000-01-01').expect(429);
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(response.headers['retry-after']).toBeDefined();
  });
  it('rechecks message delivery and disconnects a previously eligible socket on policy change', async () => {
    await assess('2000-01-01').expect(200);
    const socket = await connect();
    const reply = (await socket
      .timeout(4000)
      .emitWithAck('room:subscribe', { code })) as { ok: boolean };
    expect(reply.ok).toBe(true);
    const messages = app.get(MessageService);
    const hash = createHash('sha256').update(identity.token).digest('hex');
    const sent = await messages.send(hash, {
      code,
      text: 'hello',
      clientMessageId: randomUUID(),
    });
    const invalidated = new Promise<unknown>((resolve) =>
      socket.once('session:invalidated', resolve),
    );
    config.set('AGE_POLICY_VERSION', 'updated-policy');
    const delivery = jest.fn();
    await expect(
      messages.delivery(hash, code, sent.message.messageId, delivery),
    ).rejects.toMatchObject({ response: { code: 'AGE_SCREENING_REQUIRED' } });
    expect(delivery).not.toHaveBeenCalled();
    await expect(
      messages.send(hash, {
        code,
        text: 'blocked',
        clientMessageId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    await app.get(MessageGateway).sweep();
    await expect(invalidated).resolves.toMatchObject({
      error: { code: 'AGE_SCREENING_REQUIRED', statusCode: 403 },
    });
  });
});
