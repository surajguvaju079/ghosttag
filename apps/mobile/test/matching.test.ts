import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchState } from "../src/api/contracts";
import { ApiError } from "../src/api/client";
import { MatchingQueue } from "../src/matching/queue";
import { insertStarter } from "../src/rooms/insert-starter";
import {
  inviteLink,
  parseInvite,
  pendingInvite,
  rememberInvite,
  takeInvite,
} from "../src/linking/invites";
import { redirectSystemPath } from "../src/app/+native-intent";
import { inviteMessage } from "../src/rooms/joined-rooms";

const idle: MatchState = {
  status: "IDLE",
  matchingEnabled: true,
  blockedCount: 0,
  search: null,
  session: null,
};
const waiting: MatchState = {
  ...idle,
  status: "WAITING",
  search: {
    id: `s_${"a".repeat(32)}`,
    topic: "open",
    expiresAt: new Date(Date.now() + 120000).toISOString(),
    leaseUntil: new Date(Date.now() + 30000).toISOString(),
  },
};
const matched: MatchState = {
  ...idle,
  status: "MATCHED",
  session: {
    id: `c_${"b".repeat(32)}`,
    code: "GH-1234",
    topic: "open",
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    extended: false,
    extensionRequested: false,
    partnerRequested: false,
  },
};
const uuid = "11111111-1111-4111-8111-111111111111";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function api(): Pick<
  import("../src/api/client").ApiClient,
  | "matchingState"
  | "startMatch"
  | "heartbeatMatch"
  | "cancelMatch"
  | "clearMatchBlocks"
> {
  return {
    matchingState: async () => idle,
    startMatch: async () => waiting,
    heartbeatMatch: async () => waiting,
    cancelMatch: async () => idle,
    clearMatchBlocks: async () => idle,
  };
}

test("canonical invites carry a stable ID and parse only expected origins and paths", () => {
  const link = inviteLink("GH-1234", uuid);
  assert.equal(
    link,
    `https://surajguvaju.com.np/ghosttag/join/GH-1234/${uuid}`,
  );
  assert.deepEqual(parseInvite(link), { code: "GH-1234", inviteId: uuid });
  assert.deepEqual(
    parseInvite(`ghosttag://join/GH-1234/${uuid}`),
    parseInvite(link),
  );
  assert.deepEqual(parseInvite(`/join/GH-1234/${uuid}`), parseInvite(link));
  assert.ok(inviteMessage("GH-1234", uuid).includes(link));
  for (const value of [
    `https://evil.test/ghosttag/join/GH-1234/${uuid}`,
    `${link}?token=secret`,
    `${link}#redirect`,
    `https://user@surajguvaju.com.np/ghosttag/join/GH-1234/${uuid}`,
    "javascript:alert(1)",
    "ghosttag://join/GH-1234/invalid",
  ])
    assert.equal(parseInvite(value), null);
});
test("native intent preserves the pending invite through screening and consumes it once", () => {
  const result = redirectSystemPath({
    path: inviteLink("GH-1234", uuid),
    initial: true,
  });
  assert.equal(result, `/join/GH-1234/${uuid}`);
  assert.deepEqual(pendingInvite(), { code: "GH-1234", inviteId: uuid });
  assert.deepEqual(takeInvite(), { code: "GH-1234", inviteId: uuid });
  assert.equal(takeInvite(), null);
  rememberInvite({ code: "GH-5678", inviteId: uuid });
  assert.equal(takeInvite()?.code, "GH-5678");
  assert.equal(
    redirectSystemPath({ path: "https://evil.test/anything", initial: false }),
    "/",
  );
});
test("queue starts/resumes without duplicate starts or automatic restart after timeout", async () => {
  const fake = api();
  let starts = 0,
    navigations = 0;
  fake.startMatch = async () => {
    starts++;
    await tick();
    return waiting;
  };
  const queue = new MatchingQueue(fake, "token", () => navigations++);
  try {
    await queue.resume();
    await Promise.all([queue.start(), queue.start()]);
    assert.equal(starts, 1);
    assert.equal(queue.state.data?.status, "WAITING");
    assert.equal(navigations, 0);
    await queue.cancel();
    assert.equal(queue.state.data?.status, "IDLE");
    assert.equal(starts, 1);
  } finally {
    queue.pause();
  }
});
test("playground insertion keeps the entire existing draft", () => {
  assert.equal(insertStarter("", "New story"), "New story");
  assert.equal(insertStarter("My thought", "New story"), "My thought\n\nNew story");
  assert.equal(insertStarter("Line one\n", "New story"), "Line one\n\nNew story");
  const longDraft = "x".repeat(2100);
  assert.equal(insertStarter(longDraft, "New story").slice(0, 2100), longDraft);
});
test("queue forwards the selected topic when starting a search", async () => {
  const fake = api();
  let received = "";
  fake.startMatch = async (_token, topic) => {
    received = topic ?? "open";
    return { ...waiting, search: { ...waiting.search!, topic: received } };
  };
  const queue = new MatchingQueue(fake, "token", () => {});
  try {
    await queue.resume();
    await queue.start("music");
    assert.equal(received, "music");
    assert.equal(queue.state.data?.search?.topic, "music");
  } finally {
    queue.pause();
  }
});
test("late start after background never navigates and cancels the specific returned search", async () => {
  const fake = api();
  let resolve!: (state: MatchState) => void;
  const cancellations: string[] = [],
    navigations: string[] = [];
  fake.startMatch = () =>
    new Promise((done) => {
      resolve = done;
    });
  fake.cancelMatch = async (_token?: string, id?: string) => {
    cancellations.push(id!);
    return idle;
  };
  const queue = new MatchingQueue(fake, "token", (code) =>
    navigations.push(code),
  );
  await queue.resume();
  const start = queue.start();
  queue.pause();
  resolve(waiting);
  await start;
  assert.deepEqual(navigations, []);
  assert.deepEqual(cancellations, [waiting.search!.id]);
  assert.equal(queue.state.data?.status, "IDLE");
});
test("cancellation losing the pairing race returns the live match instead of pretending it ended", async () => {
  const fake = api();
  const navigations: string[] = [];
  fake.matchingState = async () => waiting;
  fake.cancelMatch = async () => matched;
  const queue = new MatchingQueue(fake, "token", (code) =>
    navigations.push(code),
  );
  try {
    await queue.resume();
    await queue.cancel();
    assert.equal(queue.state.data?.status, "MATCHED");
    assert.deepEqual(navigations, ["GH-1234"]);
  } finally {
    queue.pause();
  }
});
test("queue respects rate limits and retains a retryable error", async () => {
  const fake = api();
  let starts = 0;
  fake.startMatch = async () => {
    starts++;
    throw new ApiError({
      statusCode: 429,
      code: "RATE_LIMITED",
      message: "wait",
      retryAfterMs: 60000,
    });
  };
  const queue = new MatchingQueue(fake, "token", () => {});
  try {
    await queue.resume();
    await queue.start();
    await queue.start();
    assert.equal(starts, 1);
    assert.ok(queue.state.retryAt > Date.now());
    assert.ok(queue.state.error);
  } finally {
    queue.pause();
  }
});
