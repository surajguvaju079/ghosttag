import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
import { RetentionRepository } from '../src/retention/retention.repository';

type Identity = { token: string; identityId: string };
interface State {
  status: 'IDLE' | 'WAITING' | 'MATCHED';
  matchingEnabled: boolean;
  blockedCount: number;
  search: null | { id: string; expiresAt: string; leaseUntil: string };
  session: null | {
    id: string;
    code: string;
    expiresAt: string;
    extended: boolean;
    extensionRequested: boolean;
    partnerRequested: boolean;
  };
}
describe('Companionship and stable invites: PostgreSQL + HTTP + sockets', () => {
  let app: INestApplication<App>, admin: PrismaClient, prisma: PrismaClient;
  let rooms: RoomService, identities: IdentityService, config: ConfigService;
  let created = false,
    url: string;
  let a: Identity, b: Identity, outsider: Identity;
  const clients = new Set<Socket>();
  const databaseName = `ghosttag_test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    process.env.SAFETY_MATCH_SEARCH_NETWORK_LIMIT = '10000';
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
    config.set('MATCHING_ENABLED', 'true');
  }, 60_000);

  async function eligible() {
    const identity = await identities.createIdentity();
    await prisma.ageEligibility.create({
      data: {
        userId: identity.identityId,
        result: 'ELIGIBLE',
        policyVersion: AGE_POLICY_VERSION,
      },
    });
    return identity;
  }
  beforeEach(async () => {
    config.set('SOCIAL_ACCESS_ENABLED', 'true');
    config.set('MATCHING_ENABLED', 'true');
    config.set('AGE_POLICY_VERSION', AGE_POLICY_VERSION);
    [a, b, outsider] = await Promise.all([eligible(), eligible(), eligible()]);
  });
  afterEach(async () => {
    for (const socket of clients) socket.disconnect();
    clients.clear();
    // This suite owns a disposable database; searches deliberately span identities.
    await prisma.matchSearch.deleteMany();
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
  function start(user = a) {
    return request(app.getHttpServer())
      .post('/api/v1/matching/search')
      .auth(user.token, { type: 'bearer' })
      .send({ language: 'en' });
  }
  async function state(user = a) {
    return (
      await request(app.getHttpServer())
        .get('/api/v1/matching/state')
        .auth(user.token, { type: 'bearer' })
        .expect(200)
    ).body as State;
  }
  function heartbeat(id: string, user = a) {
    return request(app.getHttpServer())
      .post(`/api/v1/matching/search/${id}/heartbeat`)
      .auth(user.token, { type: 'bearer' });
  }
  function cancel(id: string, user = a) {
    return request(app.getHttpServer())
      .delete(`/api/v1/matching/search/${id}`)
      .auth(user.token, { type: 'bearer' });
  }
  function action(id: string, verb: string, user = a) {
    return request(app.getHttpServer())
      .post(`/api/v1/matching/sessions/${id}/${verb}`)
      .auth(user.token, { type: 'bearer' });
  }
  async function pair() {
    await start(a).expect(200);
    return (await start(b).expect(200)).body as State;
  }
  async function connect(user: Identity) {
    return new Promise<Socket>((resolve, reject) => {
      const socket = io(url, {
        transports: ['websocket'],
        auth: { token: user.token },
        forceNew: true,
        reconnection: false,
        timeout: 4000,
      });
      clients.add(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }
  it('defaults off, authenticates, gates age, and accepts only casual English', async () => {
    config.set('MATCHING_ENABLED', undefined);
    expect((await state()).matchingEnabled).toBe(false);
    await start().expect(503);
    await request(app.getHttpServer())
      .post('/api/v1/matching/search')
      .send({ language: 'en' })
      .expect(401);
    config.set('MATCHING_ENABLED', 'true');
    const unassessed = await identities.createIdentity();
    await start(unassessed).expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/matching/search')
      .auth(a.token, { type: 'bearer' })
      .send({ language: 'ne' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/matching/search')
      .auth(a.token, { type: 'bearer' })
      .send({ language: 'en', userId: b.identityId })
      .expect(400);
  });
  it('starts idempotently without self matching and fixes the deadline at two minutes', async () => {
    const before = Date.now();
    const responses = await Promise.all([start(), start(), start()]);
    responses.forEach((response) => expect(response.status).toBe(200));
    const result = responses[0].body as State;
    expect(result.status).toBe('WAITING');
    expect(
      responses.map((response) => (response.body as State).search!.id),
    ).toEqual([result.search!.id, result.search!.id, result.search!.id]);
    expect(
      Date.parse(result.search!.expiresAt) - before,
    ).toBeGreaterThanOrEqual(120_000);
    const renewed = (await heartbeat(result.search!.id).expect(200))
      .body as State;
    expect(renewed.search!.expiresAt).toBe(result.search!.expiresAt);
    expect(
      Date.parse(renewed.search!.leaseUntil) - Date.now(),
    ).toBeLessThanOrEqual(30_000);
  });
  it('pairs two identities atomically and returns only public identifiers', async () => {
    const matched = await pair();
    const first = await state(a);
    expect(first.session!.id).toBe(matched.session!.id);
    expect(first.status).toBe('MATCHED');
    expect(JSON.stringify(first)).not.toContain(a.identityId);
    expect(JSON.stringify(first)).not.toContain(b.identityId);
    const room = await prisma.room.findUniqueOrThrow({
      where: { code: first.session!.code },
      include: { memberships: true },
    });
    expect(room.kind).toBe('MATCHED');
    expect(room.inviteId).toBeNull();
    expect(room.memberships).toHaveLength(2);
    expect(room.expiresAt.getTime() - room.createdAt.getTime()).toBe(900_000);
    expect(
      await prisma.matchSearch.count({
        where: { userId: { in: [a.identityId, b.identityId] } },
      }),
    ).toBe(0);
    const repeated = (await start().expect(200)).body as State;
    expect(repeated.session!.id).toBe(first.session!.id);
  });
  it('excludes stale leases and invalidated candidates, then pairs FIFO', async () => {
    await start(a).expect(200);
    await prisma.matchSearch.update({
      where: { userId: a.identityId },
      data: { leaseUntil: new Date(0) },
    });
    expect(((await start(b)).body as State).status).toBe('WAITING');
    await prisma.ageEligibility.update({
      where: { userId: b.identityId },
      data: { result: 'INELIGIBLE' },
    });
    expect(((await start(outsider)).body as State).status).toBe('WAITING');
    const fourth = await eligible();
    const matched = (await start(fourth)).body as State;
    expect(matched.status).toBe('MATCHED');
    expect((await state(outsider)).session!.id).toBe(matched.session!.id);
  });
  it('serializes cancellation versus pairing and never resurrects a cancelled search', async () => {
    const search = ((await start()).body as State).search!;
    const [cancelled, second] = await Promise.all([
      cancel(search.id),
      start(b),
    ]);
    expect(cancelled.status).toBe(200);
    expect(second.status).toBe(200);
    const current = await state();
    if (current.status === 'MATCHED')
      expect((cancelled.body as State).status).toBe('MATCHED');
    else {
      expect(current.status).toBe('IDLE');
      expect(((await heartbeat(search.id)).body as State).status).toBe('IDLE');
    }
  });
  it('does not renew a later search from an obsolete heartbeat/cancel', async () => {
    const old = ((await start()).body as State).search!;
    await cancel(old.id).expect(200);
    const next = ((await start()).body as State).search!;
    await heartbeat(old.id).expect(200);
    await cancel(old.id).expect(200);
    expect((await state()).search).toEqual(next);
  });
  it('rejects third-party access through joins, reads, history, reports and socket subscriptions', async () => {
    const matched = await pair(),
      code = matched.session!.code;
    for (const path of ['', '/members', '/membership', '/messages'])
      await request(app.getHttpServer())
        .get(`/api/v1/rooms/${code}${path}`)
        .auth(outsider.token, { type: 'bearer' })
        .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${code}/join`)
      .auth(outsider.token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${code}/messages/m_${'a'.repeat(32)}/reports`)
      .auth(outsider.token, { type: 'bearer' })
      .send({ reason: 'SPAM' })
      .expect(403);
    const socket = await connect(outsider);
    const reply = (await socket
      .timeout(4000)
      .emitWithAck('room:subscribe', { code })) as { ok: boolean };
    expect(reply.ok).toBe(false);
    const details = await request(app.getHttpServer())
      .get(`/api/v1/rooms/${code}`)
      .auth(a.token, { type: 'bearer' })
      .expect(200);
    expect(details.body).toMatchObject({
      room: {
        kind: 'MATCHED',
        inviteId: null,
        maxCapacity: 2,
        matchId: matched.session!.id,
      },
    });
  });
  it('requires both extension votes, extends once, and rejects votes after expiry', async () => {
    const matched = (await pair()).session!;
    const first = (await action(matched.id, 'extend').expect(200))
      .body as State;
    expect(first.session!.extensionRequested).toBe(true);
    expect(first.session!.expiresAt).toBe(matched.expiresAt);
    const both = (await action(matched.id, 'extend', b).expect(200))
      .body as State;
    expect(both.session!.extended).toBe(true);
    expect(
      Date.parse(both.session!.expiresAt) - Date.parse(matched.expiresAt),
    ).toBe(900_000);
    expect(
      ((await action(matched.id, 'extend')).body as State).session!.expiresAt,
    ).toBe(both.session!.expiresAt);
    await prisma.room.update({
      where: { code: matched.code },
      data: { expiresAt: new Date(0) },
    });
    await action(matched.id, 'extend').expect(410);
  });
  it('normal leave ends the conversation for both; dedicated end is idempotent and cannot rejoin', async () => {
    const matched = (await pair()).session!;
    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${matched.code}/leave`)
      .auth(a.token, { type: 'bearer' })
      .expect(204);
    expect((await state(b)).status).toBe('IDLE');
    await action(matched.id, 'end', b).expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/rooms/${matched.code}/join`)
      .auth(b.token, { type: 'bearer' })
      .expect(410);
  });
  it('block-and-end survives room cleanup; clearing only own blocks does not erase the other direction', async () => {
    const matched = (await pair()).session!;
    await action(matched.id, 'block').expect(200);
    await action(matched.id, 'block', b).expect(200);
    const clear = () =>
      request(app.getHttpServer())
        .delete('/api/v1/matching/blocks')
        .auth(a.token, { type: 'bearer' });
    await clear().expect(200);
    expect((await state()).blockedCount).toBe(0);
    expect((await state(b)).blockedCount).toBe(1);
    await prisma.room.delete({ where: { code: matched.code } });
    expect(
      await prisma.matchSession.count({ where: { publicId: matched.id } }),
    ).toBe(0);
    expect(
      await prisma.matchBlock.count({ where: { blockerId: b.identityId } }),
    ).toBe(1);
    await start().expect(200);
    expect(((await start(b)).body as State).status).toBe('WAITING');
    await request(app.getHttpServer())
      .delete('/api/v1/matching/blocks')
      .auth(b.token, { type: 'bearer' })
      .expect(200);
    expect(
      ((await heartbeat((await state()).search!.id)).body as State).status,
    ).toBe('MATCHED');
  });
  it('retains end and block controls when new searches are disabled', async () => {
    const matched = (await pair()).session!;
    config.set('MATCHING_ENABLED', 'false');
    await start(outsider).expect(503);
    await action(matched.id, 'block').expect(200);
  });
  it('removes expired searches in bounded cleanup', async () => {
    await start().expect(200);
    await prisma.matchSearch.update({
      where: { userId: a.identityId },
      data: { expiresAt: new Date(0) },
    });
    await app.get(RetentionRepository).cleanupSearches();
    expect(
      await prisma.matchSearch.count({ where: { userId: a.identityId } }),
    ).toBe(0);
  });
  it('stable group invitations join explicitly, and never resolve to a recycled code', async () => {
    const group = await rooms.createRoom(a.identityId, { vibe: 'CHAOS' });
    const stored = await prisma.room.findUniqueOrThrow({
      where: { code: group.code },
    });
    const path = `/api/v1/rooms/${group.code}/invites/${stored.inviteId!}/join`;
    await request(app.getHttpServer())
      .post(path)
      .auth(b.token, { type: 'bearer' })
      .expect(200);
    await prisma.room.delete({ where: { id: stored.id } });
    const other = await rooms.createRoom(a.identityId, { vibe: 'CHAOS' });
    await prisma.room.update({
      where: { id: other.id },
      data: { code: group.code },
    });
    await request(app.getHttpServer())
      .post(path)
      .auth(outsider.token, { type: 'bearer' })
      .expect(404);
    expect(
      await prisma.roomMembership.count({
        where: { roomId: other.id, userId: outsider.identityId },
      }),
    ).toBe(0);
  });
  it('invite joins enforce eligibility, expiry and temporary locks', async () => {
    const group = await rooms.createRoom(a.identityId, { vibe: 'CHAOS' });
    const room = await prisma.room.findUniqueOrThrow({
      where: { id: group.id },
    });
    const path = `/api/v1/rooms/${group.code}/invites/${room.inviteId!}/join`;
    const unknown = await identities.createIdentity();
    await request(app.getHttpServer())
      .post(path)
      .auth(unknown.token, { type: 'bearer' })
      .expect(403);
    await prisma.room.update({
      where: { id: room.id },
      data: { lockedUntil: new Date(Date.now() + 60_000) },
    });
    await request(app.getHttpServer())
      .post(path)
      .auth(b.token, { type: 'bearer' })
      .expect(423);
    await prisma.room.update({
      where: { id: room.id },
      data: { expiresAt: new Date(0) },
    });
    await request(app.getHttpServer())
      .post(path)
      .auth(b.token, { type: 'bearer' })
      .expect(410);
  });
});
