/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiClient,
  ApiError,
  configuration,
  friendlyError,
  normalizeCode,
} from "../src/api/client";
import type { Message, History, RoomDetails } from "../src/api/contracts";
import { Session, type CredentialStore } from "../src/auth/session";
import { mergeLive, unique, validText } from "../src/messaging/history";
import type { Transport } from "../src/messaging/transport";
import { RoomSession } from "../src/rooms/room-session";

const failure = (code: string, statusCode = 401, retryAfterMs?: number) =>
  new ApiError({
    code,
    statusCode,
    message: "Server detail is not shown",
    retryAfterMs,
  });
const message = (number: number, code = "GH-1234"): Message => ({
  messageId: `m_${number.toString(16).padStart(32, "0")}`,
  code,
  text: `Message ${number}`,
  createdAt: new Date(1700000000000 + number).toISOString(),
  author: {
    participantId: "p_abc",
    ghostName: "Quiet Raven",
    ghostAvatar: "raven",
  },
});
const ghost = {
  ghostName: "Quiet Raven",
  ghostAvatar: "raven",
  role: "OWNER" as const,
};
const details: RoomDetails = {
  room: {
    code: "GH-1234",
    name: "Night thoughts",
    vibe: "DEEP_TALK",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    activeMemberCount: 1,
    maxCapacity: 50,
  },
  membership: ghost,
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function storage(initial: string | null = null) {
  let value = initial;
  let writes = 0;
  const store: CredentialStore = {
    get: async () => value,
    set: async (token) => {
      value = token;
      writes++;
    },
    clear: async () => {
      value = null;
    },
  };
  return { store, value: () => value, writes: () => writes };
}
test("identity bootstrap is single-flight and persists one credential across restarts", async () => {
  const disk = storage();
  let creates = 0;
  let validations = 0;
  const api = {
    createIdentity: async () => {
      creates++;
      return "secret";
    },
    validateIdentity: async (token: string) => {
      assert.equal(token, "secret");
      validations++;
    },
  };
  const session = new Session(disk.store, api);
  await Promise.all([
    session.bootstrap(),
    session.bootstrap(),
    session.bootstrap(),
  ]);
  assert.equal(creates, 1);
  assert.equal(disk.writes(), 1);
  assert.equal(session.state.status, "ready");
  await new Session(disk.store, api).bootstrap();
  assert.equal(creates, 1);
  assert.equal(validations, 1);
});
test("network failures keep saved credentials and never create a replacement", async () => {
  const disk = storage("saved");
  let creates = 0;
  const session = new Session(disk.store, {
    createIdentity: async () => {
      creates++;
      return "new";
    },
    validateIdentity: async () => {
      throw new Error("offline");
    },
  });
  await session.bootstrap();
  assert.equal(session.state.status, "error");
  assert.equal(disk.value(), "saved");
  assert.equal(creates, 0);
});
for (const code of [
  "IDENTITY_REVOKED",
  "IDENTITY_EXPIRED",
  "INVALID_IDENTITY_CREDENTIAL",
])
  test(`${code} waits for explicit fresh-session action`, async () => {
    const disk = storage("invalid");
    let creates = 0;
    const session = new Session(disk.store, {
      createIdentity: async () => {
        creates++;
        return "replacement";
      },
      validateIdentity: async () => {
        throw failure(code);
      },
    });
    await session.bootstrap();
    await session.bootstrap();
    assert.equal(session.state.status, "invalid");
    assert.equal(creates, 0);
    assert.equal(session.state.token, undefined);
    await session.startFresh();
    assert.equal(creates, 1);
    assert.equal(disk.value(), "replacement");
    assert.equal(session.state.status, "ready");
  });
test("invalidation during bootstrap cannot restore a stale credential", async () => {
  let resolve!: () => void;
  const session = new Session(storage("secret").store, {
    createIdentity: async () => "unused",
    validateIdentity: () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  });
  const boot = session.bootstrap();
  await tick();
  session.invalidate();
  resolve();
  await boot;
  assert.equal(session.state.status, "invalid");
});
test("API uses bearer auth, normalizes codes, discards create UUID and sends exact report reasons", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(
      JSON.stringify(
        String(url).endsWith("/rooms")
          ? { id: "private-uuid", code: "GH-1234" }
          : { accepted: true },
      ),
      { status: 200 },
    );
  }) as typeof fetch;
  const api = new ApiClient("http://api/api/v1", fetcher);
  assert.equal(
    await api.createRoom("credential", "CHAOS", "  My room  "),
    "GH-1234",
  );
  assert.equal(await api.joinRoom("credential", " gh-1234 "), "GH-1234");
  await api.report("credential", "GH-1234", message(1).messageId, "HARASSMENT");
  assert.equal(requests[1].url, "http://api/api/v1/rooms/GH-1234/join");
  assert.equal(
    (requests[0].init?.headers as Record<string, string>).Authorization,
    "Bearer credential",
  );
  assert.deepEqual(JSON.parse(requests[0].init?.body as string), {
    vibe: "CHAOS",
    name: "My room",
  });
  assert.deepEqual(JSON.parse(requests[2].init?.body as string), {
    reason: "HARASSMENT",
  });
  await api.report("credential", "GH-1234", message(2).messageId, "CHILD_SAFETY");
  assert.deepEqual(JSON.parse(requests[3].init?.body as string), {
    reason: "CHILD_SAFETY",
  });
  assert.ok(!requests.some((request) => request.url.includes("credential")));
});
test("HTTP authentication and rate-limit failures retain structured metadata", async () => {
  let invalidations = 0;
  const api = new ApiClient(
    "http://api/api/v1",
    (async () =>
      new Response(JSON.stringify({ code: "IDENTITY_REVOKED" }), {
        status: 401,
      })) as typeof fetch,
    () => invalidations++,
  );
  await assert.rejects(
    api.details("secret", "GH-1234"),
    (error) =>
      error instanceof ApiError && error.failure.code === "IDENTITY_REVOKED",
  );
  assert.equal(invalidations, 1);
  const limited = new ApiClient(
    "http://api/api/v1",
    (async () =>
      new Response(JSON.stringify({ code: "RATE_LIMITED" }), {
        status: 429,
        headers: { "Retry-After": "3" },
      })) as typeof fetch,
  );
  await assert.rejects(
    limited.joinRoom("secret", "GH-1234"),
    (error) => error instanceof ApiError && error.failure.retryAfterMs === 3000,
  );
});
test("configuration requires a reachable explicit base and rejects URL credentials", () => {
  assert.throws(() => configuration());
  assert.throws(() => configuration("http://secret@host/api/v1"));
  assert.throws(() => configuration("http://host/api/v1", "http://host/rooms"));
  assert.equal(
    configuration("http://10.0.2.2:3000/api/v1").socketUrl,
    "http://10.0.2.2:3000",
  );
  assert.equal(normalizeCode(" gh-1234 "), "GH-1234");
  assert.throws(() => normalizeCode("1234"));
});
test("room lifecycle errors have specific safe user messages", () => {
  for (const [code, status] of [
    ["ROOM_NOT_FOUND", 404],
    ["ROOM_EXPIRED", 410],
    ["ROOM_LOCKED", 423],
    ["ROOM_FULL", 409],
    ["ROOM_MEMBERSHIP_INACTIVE", 403],
  ] as const) {
    const text = friendlyError(failure(code, status));
    assert.ok(text.length > 20);
    assert.ok(!text.includes("Server detail"));
    assert.ok(!text.includes("Something went wrong"));
  }
});
test("history deduplicates IDs, retains authoritative page order, and orders live events", () => {
  assert.deepEqual(
    unique([message(3), message(2), message(3)]).map((item) => item.messageId),
    [message(3).messageId, message(2).messageId],
  );
  assert.deepEqual(
    mergeLive([message(3), message(1)], message(2)).map((item) => item.text),
    ["Message 3", "Message 2", "Message 1"],
  );
  assert.equal(mergeLive([message(1)], message(1)).length, 1);
  assert.equal(validText("   "), false);
  assert.equal(validText("a".repeat(2001)), false);
  assert.equal(validText("\u0000"), false);
  assert.equal(validText("\ud800"), false);
  assert.equal(validText("hello 👻"), true);
});
class FakeSocket implements Transport {
  listeners = new Map<string, (data?: any) => void>();
  calls: { event: string; payload: any }[] = [];
  sendError?: ApiError;
  subscribeError?: ApiError;
  connect() {
    this.emit("connect");
  }
  disconnect() {
    this.listeners.clear();
  }
  on(event: string, listener: (data?: any) => void) {
    this.listeners.set(event, listener);
  }
  emit(event: string, data?: unknown) {
    this.listeners.get(event)?.(data);
  }
  async request<T>(event: string, payload: object): Promise<T> {
    this.calls.push({ event, payload });
    if (event === "room:subscribe") {
      if (this.subscribeError) throw this.subscribeError;
      return {
        code: "GH-1234",
        subscribed: true,
        participant: { ...ghost, participantId: "p_abc" },
      } as T;
    }
    if (this.sendError) throw this.sendError;
    return {
      clientMessageId: (payload as { clientMessageId: string }).clientMessageId,
      replayed: true,
      message: message(999),
    } as T;
  }
}
function harness(
  pages: History[] = [{ messages: [message(2), message(1)], nextCursor: null }],
  uuid: () => string = () => "ec5d660f-429b-4099-89ba-b04ffedfcf10",
) {
  let index = 0;
  let invalidations = 0;
  const sockets: FakeSocket[] = [];
  const historyCalls: (string | undefined)[] = [];
  const reports: unknown[] = [];
  const joins: string[] = [];
  let detailsError: ApiError | undefined;
  let reportError: ApiError | undefined;
  const api = {
    details: async () => {
      if (detailsError) throw detailsError;
      return details;
    },
    members: async () => ({
      members: [{ ...ghost, joinedAt: new Date().toISOString() }],
      total: 1,
      maxCapacity: 50,
    }),
    membership: async () => ({
      membership: {
        ...ghost,
        status: "ACTIVE" as const,
        joinedAt: new Date().toISOString(),
        leftAt: null,
      },
    }),
    history: async (_token: string, _code: string, before?: string) => {
      historyCalls.push(before);
      return pages[Math.min(index++, pages.length - 1)];
    },
    leave: async () => {},
    joinRoom: async (_token: string, code: string) => {
      joins.push(code);
      detailsError = undefined;
      return code;
    },
    report: async (...args: unknown[]) => {
      if (reportError) throw reportError;
      reports.push(args);
      return { accepted: true };
    },
  } as unknown as ApiClient;
  const controller = new RoomSession(
    api,
    "secret",
    "gh-1234",
    () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    uuid,
    () => invalidations++,
  );
  return {
    controller,
    sockets,
    historyCalls,
    reports,
    joins,
    invalidations: () => invalidations,
    setReportError: (error?: ApiError) => {
      reportError = error;
    },
    setError: (error?: ApiError) => {
      detailsError = error;
    },
  };
}
test("room bootstrap subscribes, loads membership/history, ignores cross-room pushes, and paginates", async () => {
  const h = harness([
    { messages: [message(3), message(2)], nextCursor: message(2).messageId },
    { messages: [message(1)], nextCursor: null },
  ]);
  try {
    await h.controller.start();
    await tick();
    assert.equal(h.controller.state.status, "ready");
    assert.equal(h.controller.state.membership?.role, "OWNER");
    h.sockets[0].emit("message:created", message(4, "GH-9999"));
    assert.equal(h.controller.state.messages.length, 2);
    h.sockets[0].emit("message:created", message(3));
    assert.equal(h.controller.state.messages.length, 2);
    await h.controller.older();
    assert.equal(h.historyCalls[1], message(2).messageId);
    assert.equal(h.controller.state.messages.length, 3);
    assert.equal(h.controller.state.nextCursor, null);
  } finally {
    h.controller.dispose();
  }
});
test("reconnect recovery follows multiple pages to overlap and deduplicates buffered pushes", async () => {
  const h = harness([
    { messages: [message(2), message(1)], nextCursor: null },
    { messages: [message(6), message(5)], nextCursor: message(5).messageId },
    { messages: [message(4), message(3)], nextCursor: message(3).messageId },
    { messages: [message(2), message(1)], nextCursor: null },
  ]);
  try {
    await h.controller.start();
    await tick();
    h.controller.pause();
    await h.controller.start();
    h.sockets[1].emit("message:created", message(6));
    h.sockets[1].emit("message:created", message(7));
    await tick();
    assert.equal(h.sockets.length, 2);
    assert.equal(h.sockets[1].calls[0].event, "room:subscribe");
    assert.equal(h.historyCalls.length, 4);
    assert.deepEqual(
      h.controller.state.messages.map((item) => item.text),
      [7, 6, 5, 4, 3, 2, 1].map((i) => `Message ${i}`),
    );
  } finally {
    h.controller.dispose();
  }
});
test("timed-out sends retry with the original UUID and exact text", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    const socket = h.sockets[0];
    socket.sendError = failure("ACK_TIMEOUT", 0);
    await h.controller.send("hello");
    const pending = h.controller.state.pending[0];
    assert.equal(pending.sending, false);
    socket.sendError = undefined;
    await h.controller.send("changed text", pending.key);
    const sends = socket.calls.filter((call) => call.event === "message:send");
    assert.deepEqual(sends[0].payload, sends[1].payload);
    assert.equal(h.controller.state.pending.length, 0);
    assert.equal(
      h.controller.state.messages[0].messageId,
      message(999).messageId,
    );
  } finally {
    h.controller.dispose();
  }
});
test("message rate limits stop repeat sends while permitting reports", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    h.sockets[0].sendError = failure("RATE_LIMITED", 429, 60000);
    await h.controller.send("hello");
    const calls = h.sockets[0].calls.length;
    assert.equal(await h.controller.send("another"), false);
    assert.equal(await h.controller.report(message(1).messageId, "SPAM"), true);
    assert.equal(h.sockets[0].calls.length, calls);
    assert.equal(h.reports.length, 1);
  } finally {
    h.controller.dispose();
  }
});
test("reports use only the current room public message ID and supported reason", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    assert.equal(await h.controller.report(message(1).messageId, "HATE"), true);
    assert.deepEqual(h.reports[0], [
      "secret",
      "GH-1234",
      message(1).messageId,
      "HATE",
    ]);
    assert.ok(h.controller.state.notice);
  } finally {
    h.controller.dispose();
  }
});
for (const [code, status] of [
  ["ROOM_LOCKED", 423],
  ["ROOM_MEMBERSHIP_INACTIVE", 403],
  ["ROOM_EXPIRED", 410],
] as const)
  test(`${code} invalidates subscriptions and clears cached content`, async () => {
    const h = harness();
    try {
      await h.controller.start();
      await tick();
      h.sockets[0].emit("room:invalidated", {
        code: "GH-1234",
        error: { code, statusCode: status, message: "Unavailable" },
      });
      assert.equal(h.controller.state.messages.length, 0);
      assert.ok(["blocked", "expired"].includes(h.controller.state.status));
      assert.equal(await h.controller.send("blocked"), false);
      if (status === 403) {
        await h.controller.rejoin();
        await tick();
        assert.equal(h.joins.length, 1);
        assert.equal(h.controller.state.status, "ready");
      }
    } finally {
      h.controller.dispose();
    }
  });
test("session invalidation is terminal, including verification failures, and drops local data", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    h.sockets[0].emit("session:invalidated", {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        statusCode: 500,
        message: "Unavailable",
      },
    });
    assert.equal(h.invalidations(), 1);
    assert.equal(h.controller.state.messages.length, 0);
    assert.equal(h.controller.state.status, "blocked");
  } finally {
    h.controller.dispose();
  }
});
test("access-denied REST bootstrap never opens a socket", async () => {
  const h = harness();
  h.setError(failure("ROOM_MEMBERSHIP_REQUIRED", 403));
  try {
    await h.controller.start();
    assert.equal(h.sockets.length, 0);
    assert.equal(h.controller.state.status, "blocked");
  } finally {
    h.controller.dispose();
  }
});
test("explicit leave clears content while pause preserves membership and recovery data", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    h.controller.pause();
    assert.equal(h.controller.state.messages.length, 2);
    assert.equal(await h.controller.leave(), true);
    assert.equal(h.controller.state.messages.length, 0);
  } finally {
    h.controller.dispose();
  }
});

test("a failed secure write retries the same newly-created identity", async () => {
  const disk = storage();
  let creates = 0,
    attempts = 0;
  const store = {
    ...disk.store,
    set: async (token: string) => {
      if (++attempts === 1) throw new Error("Keychain unavailable");
      await disk.store.set(token);
    },
  };
  const session = new Session(store, {
    createIdentity: async () => {
      creates++;
      return "one-credential";
    },
    validateIdentity: async () => {},
  });
  await session.bootstrap();
  assert.equal(session.state.status, "error");
  await session.bootstrap();
  assert.equal(session.state.status, "ready");
  assert.equal(creates, 1);
  assert.equal(disk.value(), "one-credential");
});
test("background pause unsubscribes and stale socket pushes cannot mutate the room", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    const old = h.sockets[0].listeners.get("message:created");
    h.controller.pause();
    assert.ok(
      h.sockets[0].calls.some((call) => call.event === "room:unsubscribe"),
    );
    old?.(message(99));
    assert.equal(h.controller.state.messages.length, 2);
  } finally {
    h.controller.dispose();
  }
});
test("expired local timestamp blocks foreground networking and clears history immediately", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    h.controller.pause();
    h.controller.state = {
      ...h.controller.state,
      details: {
        ...details,
        room: {
          ...details.room,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
    };
    await h.controller.start();
    assert.equal(h.sockets.length, 1);
    assert.equal(h.controller.state.status, "expired");
    assert.equal(h.controller.state.messages.length, 0);
  } finally {
    h.controller.dispose();
  }
});
test("subscription quota errors keep the room disabled and suppress immediate retries", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    h.controller.pause();
    // Create the next socket with a limited subscription acknowledgement.
    const original = FakeSocket.prototype.request;
    FakeSocket.prototype.request = async function <T>(
      event: string,
      payload: object,
    ): Promise<T> {
      if (event === "room:subscribe") throw failure("RATE_LIMITED", 429, 60000);
      return original.call(this, event, payload) as Promise<T>;
    };
    try {
      await h.controller.start();
      await tick();
      assert.equal(h.controller.state.status, "offline");
      await h.controller.start();
      assert.equal(h.sockets.length, 2);
    } finally {
      FakeSocket.prototype.request = original;
    }
  } finally {
    h.controller.dispose();
  }
});

test("fetch is invoked as a standalone function for browser compatibility", async () => {
  const fetcher = async function (this: unknown) {
    assert.equal(this, undefined);
    return new Response(JSON.stringify({ code: "GH-1234" }), { status: 200 });
  } as typeof fetch;
  assert.equal(
    await new ApiClient("http://api/api/v1", fetcher).createRoom(
      "secret",
      "CHAOS",
      "",
    ),
    "GH-1234",
  );
});
test("identity bootstrap respects structured rate-limit retry deadlines", async () => {
  let calls = 0;
  const session = new Session(storage().store, {
    createIdentity: async () => {
      calls++;
      throw failure("RATE_LIMITED", 429, 60000);
    },
    validateIdentity: async () => {},
  });
  await session.bootstrap();
  await session.bootstrap();
  assert.equal(calls, 1);
  assert.equal(session.state.status, "error");
});

test("missing rooms preserve the not-found error instead of becoming a generic expiry", async () => {
  const h = harness();
  h.setError(failure("ROOM_NOT_FOUND", 404));
  try {
    await h.controller.start();
    assert.equal(h.controller.state.error?.failure.code, "ROOM_NOT_FOUND");
    assert.equal(h.sockets.length, 0);
  } finally {
    h.controller.dispose();
  }
});

test("report cooldown does not disable sending and resets after its deadline", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    h.setReportError(failure("RATE_LIMITED", 429, 60000));
    assert.equal(
      await h.controller.report(message(1).messageId, "SPAM"),
      false,
    );
    assert.equal(await h.controller.send("still talking"), true);
    assert.equal(
      await h.controller.report(message(1).messageId, "SPAM"),
      false,
    );
    h.setReportError();
    h.controller.state = {
      ...h.controller.state,
      reportRetryAt: Date.now() - 1,
    };
    assert.equal(await h.controller.report(message(1).messageId, "SPAM"), true);
  } finally {
    h.controller.dispose();
  }
});

test("recovery uses the last history anchor rather than a later live message across missing pages", async () => {
  const h = harness([
    { messages: [message(2), message(1)], nextCursor: null },
    {
      messages: [message(8), message(7), message(6)],
      nextCursor: message(6).messageId,
    },
    {
      messages: [message(5), message(4), message(3)],
      nextCursor: message(3).messageId,
    },
    { messages: [message(2), message(1)], nextCursor: null },
  ]);
  try {
    await h.controller.start();
    await tick();
    h.sockets[0].emit("message:created", message(6));
    h.controller.pause();
    await h.controller.start();
    await tick();
    assert.equal(h.historyCalls.length, 4);
    assert.deepEqual(
      h.controller.state.messages.map((item) => item.text),
      [8, 7, 6, 5, 4, 3, 2, 1].map((number) => `Message ${number}`),
    );
  } finally {
    h.controller.dispose();
  }
});
test("recovery from an initially empty room fetches all new pages despite live pushes", async () => {
  const h = harness([
    { messages: [], nextCursor: null },
    { messages: [message(4), message(3)], nextCursor: message(3).messageId },
    { messages: [message(2), message(1)], nextCursor: null },
  ]);
  try {
    await h.controller.start();
    await tick();
    h.sockets[0].emit("message:created", message(4));
    h.controller.pause();
    await h.controller.start();
    await tick();
    assert.equal(h.controller.state.messages.length, 4);
    assert.equal(h.historyCalls.length, 3);
  } finally {
    h.controller.dispose();
  }
});
test("foreground credential validation is single-flight and never replaces a revoked credential", async () => {
  const disk = storage("saved");
  let creates = 0,
    validates = 0;
  const session = new Session(disk.store, {
    createIdentity: async () => {
      creates++;
      return "unused";
    },
    validateIdentity: async () => {
      if (++validates > 1) throw failure("IDENTITY_REVOKED");
    },
  });
  await session.bootstrap();
  await Promise.all([session.revalidate(), session.revalidate()]);
  assert.equal(validates, 2);
  assert.equal(creates, 0);
  assert.equal(session.state.status, "invalid");
  assert.equal(disk.value(), "saved");
});
test("offline foreground validation retains the ready identity for later authenticated operations", async () => {
  const disk = storage("saved");
  let offline = false;
  const session = new Session(disk.store, {
    createIdentity: async () => "unused",
    validateIdentity: async () => {
      if (offline) throw new Error("offline");
    },
  });
  await session.bootstrap();
  offline = true;
  await session.revalidate();
  assert.equal(session.state.status, "ready");
  assert.equal(disk.value(), "saved");
});
test("expiry gates sends and reports before the next screen countdown tick", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    h.controller.state = {
      ...h.controller.state,
      details: {
        ...details,
        room: {
          ...details.room,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      },
    };
    assert.equal(await h.controller.send("too late"), false);
    assert.equal(
      await h.controller.report(message(1).messageId, "SPAM"),
      false,
    );
    assert.equal(h.controller.state.status, "expired");
    assert.equal(h.controller.state.messages.length, 0);
    assert.equal(h.reports.length, 0);
  } finally {
    h.controller.dispose();
  }
});
test("pending retries preserve their key and exact text through background and foreground recovery", async () => {
  const h = harness();
  try {
    await h.controller.start();
    await tick();
    h.sockets[0].sendError = failure("ACK_TIMEOUT", 0);
    await h.controller.send("uncertain text");
    const pending = h.controller.state.pending[0];
    h.controller.pause();
    await h.controller.start();
    await tick();
    assert.equal(
      h.sockets[1].calls.filter((call) => call.event === "message:send").length,
      0,
    );
    await h.controller.send("edited draft", pending.key);
    assert.deepEqual(
      h.sockets[0].calls.find((call) => call.event === "message:send")?.payload,
      h.sockets[1].calls.find((call) => call.event === "message:send")?.payload,
    );
    assert.equal(h.controller.state.pending.length, 0);
  } finally {
    h.controller.dispose();
  }
});
test("process restart discards uncertain sends and recovers committed messages without automatic resend", async () => {
  const first = harness();
  await first.controller.start();
  await tick();
  first.sockets[0].sendError = failure("ACK_TIMEOUT", 0);
  await first.controller.send("uncertain");
  first.controller.dispose();
  const restarted = harness([{ messages: [message(999)], nextCursor: null }]);
  try {
    await restarted.controller.start();
    await tick();
    assert.equal(restarted.controller.state.pending.length, 0);
    assert.equal(restarted.controller.state.messages.length, 1);
    assert.equal(
      restarted.sockets[0].calls.filter((call) => call.event === "message:send")
        .length,
      0,
    );
  } finally {
    restarted.controller.dispose();
  }
});

test("cooldown feedback counts down and allows retry feedback at the deadline", () => {
  const error = failure("RATE_LIMITED", 429, 60000);
  assert.match(friendlyError(error, error.retryAt - 2000), /2s/);
  assert.equal(friendlyError(error, error.retryAt), "You can try again now.");
});

test("a device UUID failure keeps the draft retryable without creating a pending send", async () => {
  const h = harness(undefined, () => {
    throw new Error("randomness unavailable");
  });
  try {
    await h.controller.start();
    await tick();
    assert.equal(await h.controller.send("keep my draft"), false);
    assert.equal(h.controller.state.pending.length, 0);
    assert.equal(
      h.controller.state.error?.failure.code,
      "SEND_KEY_UNAVAILABLE",
    );
    assert.equal(
      h.sockets[0].calls.filter((call) => call.event === "message:send").length,
      0,
    );
  } finally {
    h.controller.dispose();
  }
});

test("a late HTTP authentication failure from a replaced credential cannot invalidate the new session", async () => {
  const session = new Session(storage("old-credential").store, {
    createIdentity: async () => "new-credential",
    validateIdentity: async () => {},
  });
  await session.bootstrap();
  session.invalidate();
  await session.startFresh();
  session.invalidateCredential("old-credential");
  assert.equal(session.state.status, "ready");
  session.invalidateCredential("new-credential");
  assert.equal(session.state.status, "invalid");
});
