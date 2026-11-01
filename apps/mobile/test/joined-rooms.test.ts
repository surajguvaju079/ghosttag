import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClient, ApiError } from "../src/api/client";
import type { JoinedRoom, JoinedRooms } from "../src/api/contracts";
import {
  JoinedRoomsController,
  inviteMessage,
  visibleRooms,
} from "../src/rooms/joined-rooms";
const room: JoinedRoom = {
  code: "GH-1234",
  name: "Room",
  vibe: "CHAOS",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  lockedUntil: null,
  membershipStatus: "LEFT",
};
const failure = (code: string, statusCode: number) =>
  new ApiError({ code, statusCode, message: code });

test("room list uses the authenticated read endpoint", async () => {
  const api = new ApiClient("https://example.test/api/v1", (async (
    url,
    options,
  ) => {
    assert.equal(url, "https://example.test/api/v1/rooms");
    assert.equal(
      (options?.headers as Record<string, string>).Authorization,
      "Bearer secret",
    );
    assert.equal(options?.method, "GET");
    return new Response(JSON.stringify({ rooms: [room] }));
  }) as typeof fetch);
  assert.deepEqual(await api.rooms("secret"), { rooms: [room] });
});
test("list loads empty state, refreshes after leaving, and filters expired rooms", async () => {
  let rooms: JoinedRoom[] = [];
  const controller = new JoinedRoomsController(
    { rooms: async () => ({ rooms }), joinRoom: async () => room.code },
    "secret",
  );
  await controller.refresh();
  assert.equal(controller.state.loaded, true);
  assert.equal(controller.state.rooms.length, 0);
  rooms = [{ ...room, membershipStatus: "ACTIVE" }];
  await controller.refresh();
  assert.equal(controller.state.rooms[0].membershipStatus, "ACTIVE");
  rooms = [room];
  await controller.refresh();
  assert.equal(controller.state.rooms[0].membershipStatus, "LEFT");
  assert.deepEqual(visibleRooms(rooms, Date.parse(room.expiresAt)), []);
});
test("late reads and rejoins are ignored after leaving the screen or changing sessions", async () => {
  let resolve!: (value: JoinedRooms) => void;
  let joined!: (value: string) => void;
  const controller = new JoinedRoomsController(
    {
      rooms: () =>
        new Promise((done) => {
          resolve = done;
        }),
      joinRoom: () =>
        new Promise((done) => {
          joined = done;
        }),
    },
    "old-token",
  );
  const loading = controller.refresh();
  assert.equal(controller.state.loading, true);
  controller.cancel();
  resolve({ rooms: [room] });
  await loading;
  assert.equal(controller.state.rooms.length, 0);
  const joining = controller.rejoin(room);
  controller.cancel();
  joined(room.code);
  assert.equal(await joining, false);
  assert.equal(controller.state.workingCode, undefined);
});
test("network failure retains loaded rooms and allows retry", async () => {
  let offline = false;
  const controller = new JoinedRoomsController(
    {
      rooms: async () => {
        if (offline) throw Error("offline");
        return { rooms: [room] };
      },
      joinRoom: async () => room.code,
    },
    "secret",
  );
  await controller.refresh();
  offline = true;
  await controller.refresh();
  assert.ok(controller.state.error);
  assert.deepEqual(controller.state.rooms, [room]);
  offline = false;
  await controller.refresh();
  assert.equal(controller.state.error, undefined);
});
test("rejoin reactivates only on success and serializes requests", async () => {
  let joins = 0;
  const controller = new JoinedRoomsController(
    {
      rooms: async () => ({ rooms: [room] }),
      joinRoom: async () => {
        joins++;
        return room.code;
      },
    },
    "secret",
  );
  await controller.refresh();
  assert.deepEqual(
    await Promise.all([controller.rejoin(room), controller.rejoin(room)]),
    [true, false],
  );
  assert.equal(joins, 1);
  assert.equal(controller.state.rooms[0].membershipStatus, "ACTIVE");
});
for (const [code, status] of [
  ["ROOM_FULL", 409],
  ["ROOM_LOCKED", 423],
  ["RATE_LIMITED", 429],
  ["ROOM_EXPIRED", 410],
  ["ROOM_NOT_FOUND", 404],
] as const) {
  test(`rejoin handles ${code} without pretending it succeeded`, async () => {
    const controller = new JoinedRoomsController(
      {
        rooms: async () => ({ rooms: [room] }),
        joinRoom: async () => {
          throw failure(code, status);
        },
      },
      "secret",
    );
    await controller.refresh();
    assert.equal(await controller.rejoin(room), false);
    assert.equal(controller.state.workingCode, undefined);
    assert.ok(controller.state.error);
    assert.equal(
      controller.state.rooms.length,
      status === 410 || status === 404 ? 0 : 1,
    );
    if (controller.state.rooms.length)
      assert.equal(controller.state.rooms[0].membershipStatus, "LEFT");
  });
}
test("invite contains only the public room code and entry instructions", () => {
  assert.equal(
    inviteMessage(room.code),
    "Join me on GhostTag! Room code: GH-1234. Open GhostTag and enter this code.",
  );
});
