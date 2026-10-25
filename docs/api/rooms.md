# GhostTag Rooms API

All endpoints require `Authorization: Bearer <anonymous-identity-token>`.
Authentication establishes the user; clients cannot supply internal user IDs.
Room codes are public identifiers, trimmed and converted to uppercase before lookup.

## Create room (existing)

`POST /api/v1/rooms` returns `201 Created`. The body contains a required `vibe`
(`DEEP_TALK`, `CHAOS`, `RANT_ZONE`, or `GAMER_LOBBY`) and optional `name` (up to
100 characters). Room creation atomically creates an ACTIVE OWNER membership and a
room expiring in 24 hours. The existing response is unchanged: `id`, `code`, `vibe`,
`name`, `expiresAt`, and `membership` containing `ghostName` and `ghostAvatar`.
The legacy `id` field is an internal room UUID; membership operations use only `code`.

## Join room

`POST /api/v1/rooms/:code/join` takes no request body and returns `200 OK`:

```json
{
  "room": {
    "code": "GH-4829",
    "vibe": "DEEP_TALK",
    "name": "Late Night Thoughts",
    "expiresAt": "2026-10-19T05:15:00.000Z"
  },
  "membership": {
    "ghostName": "Quiet Raven",
    "ghostAvatar": "raven",
    "role": "MEMBER"
  }
}
```

An existing ACTIVE membership returns the same identity and role, including when the
room is full. A LEFT membership is reactivated only if capacity is available, with
`leftAt` cleared and its ghost name, avatar, role, and original `joinedAt` preserved.
First-time joins receive a new ACTIVE MEMBER membership. Capacity is 50 ACTIVE
memberships including the owner. Concurrent requests cannot exceed that capacity or
create duplicate memberships. Join returns no internal database IDs or credentials.
The response key is `membership`, correcting the unrouted draft service's spelling.

## Leave room

`POST /api/v1/rooms/:code/leave` takes no request body and returns `204 No Content`.

An ACTIVE membership becomes LEFT and records `leftAt`. Ghost identity, role, and
`joinedAt` are preserved. Leaving as OWNER does not delete the room or transfer
ownership. Repeating leave for an existing LEFT membership also returns 204 and
preserves the original `leftAt`. A user who never joined receives 403.

Both join and leave check room existence, expiration, then temporary lock state
before membership. Expiration is authoritative when `expiresAt <= now`, even if
persisted status is ACTIVE. A temporary lock applies while `lockedUntil > now`.
Repeated join/leave requests also enforce these accessibility rules.

## Room details

`GET /api/v1/rooms/:code` returns `200 OK` for an authenticated ACTIVE member:

```json
{
  "room": {
    "code": "GH-4829",
    "vibe": "DEEP_TALK",
    "name": "Late Night Thoughts",
    "createdAt": "2026-10-18T05:15:00.000Z",
    "expiresAt": "2026-10-19T05:15:00.000Z",
    "activeMemberCount": 2,
    "maxCapacity": 50
  },
  "membership": {
    "ghostName": "Quiet Raven",
    "ghostAvatar": "raven",
    "role": "OWNER"
  }
}
```

`name` may be null. The count includes all ACTIVE participants, including the owner
when ACTIVE. LEFT memberships do not count. `membership` is the authenticated
user's identity in this room, with the same public fields as join.

## Room participants

`GET /api/v1/rooms/:code/members` returns `200 OK` for an authenticated ACTIVE member:

```json
{
  "members": [
    {
      "ghostName": "Quiet Raven",
      "ghostAvatar": "raven",
      "role": "OWNER",
      "joinedAt": "2026-10-18T05:15:00.000Z"
    },
    {
      "ghostName": "Neon Fox",
      "ghostAvatar": "fox",
      "role": "MEMBER",
      "joinedAt": "2026-10-18T06:00:00.000Z"
    }
  ],
  "total": 2,
  "maxCapacity": 50
}
```

Only ACTIVE memberships in the requested room are returned, including the caller.
Order is original `joinedAt` ascending, then internal membership ID ascending for
stable ties; the ID is never returned. Rejoining preserves the original `joinedAt`
and therefore the member's place in this order. Ghost names and avatars need not
be unique, and must not be treated as global identifiers.

Pagination is intentionally omitted for the current maximum of 50 ACTIVE members.
The response always contains the complete list; `total` equals `members.length`.
There are no pagination parameters or cursors and no silent truncation. Revisit
pagination before increasing capacity; any future cursor must not expose internal
IDs. Query parameters cannot select another identity or bypass membership checks.

## Current membership

`GET /api/v1/rooms/:code/membership` returns `200 OK` for an authenticated ACTIVE member:

```json
{
  "membership": {
    "ghostName": "Quiet Raven",
    "ghostAvatar": "raven",
    "role": "OWNER",
    "status": "ACTIVE",
    "joinedAt": "2026-10-18T05:15:00.000Z",
    "leftAt": null
  }
}
```

The identity comes only from the bearer credential and the resolved room. This is
not a lookup endpoint for other users or historical memberships. `joinedAt` is the
original join timestamp. Success always has `status: ACTIVE` and `leftAt: null`;
a LEFT membership is denied even though its stored timestamps remain available
internally for reactivation. No internal UUIDs, global identity metadata, or
credentials appear in any of the three GET responses. Timestamps use ISO 8601 UTC.
Successful GET responses carry `Cache-Control: no-store`.

All three GET endpoints authenticate first, normalize the public code, enforce
existence, expiration, and temporary locks, then require an ACTIVE membership.
Missing membership returns `403 ROOM_MEMBERSHIP_REQUIRED`; LEFT membership returns
`403 ROOM_MEMBERSHIP_INACTIVE`. There are no membership writes or implicit rejoins.

## Errors

| HTTP | Code | Applies to | Meaning |
| --- | --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | All | Missing or malformed bearer credential |
| 401 | `INVALID_IDENTITY_CREDENTIAL` | All | Unknown credential |
| 401 | `IDENTITY_REVOKED` | All | Credential revoked |
| 401 | `IDENTITY_EXPIRED` | All | Credential expired |
| 403 | `ROOM_MEMBERSHIP_REQUIRED` | Leave, all GET endpoints | Identity has never joined this room |
| 403 | `ROOM_MEMBERSHIP_INACTIVE` | All GET endpoints | Membership is LEFT; join again before reading |
| 404 | `ROOM_NOT_FOUND` | Join, leave, all GET endpoints | Public room code does not exist |
| 410 | `ROOM_EXPIRED` | Join, leave, all GET endpoints | Room expiration time reached |
| 423 | `ROOM_LOCKED` | Join, leave, all GET endpoints | Temporary lock has not elapsed |
| 409 | `ROOM_FULL` | Join | No available ACTIVE membership slot |

The existing global exception filter returns structured errors, for example:

```json
{
  "statusCode": 410,
  "code": "ROOM_EXPIRED",
  "message": "This room has expired",
  "path": "/api/v1/rooms/GH-4829/join",
  "timestamp": "2026-10-19T05:15:00.000Z",
  "requestId": "unknown"
}
```

Use `room.code` for membership operations. `room.expiresAt` supports a display
countdown; server time remains authoritative. Ghost identity is scoped to the room.


## Legacy create-room UUID: compatibility and migration recommendation

The existing v1 create response exposes `id: room.id`. It is an internal room UUID,
not an authentication credential, but it is unnecessary public storage metadata.
The audit found no room API consumers in `apps/mobile` or the shared packages;
backend tests use the UUID internally for fixture setup. External consumers cannot
be ruled out from this repository audit. Removing `id`, renaming it, or changing its
value to the public code could break a client that stores, validates, or reads it.
The field remains unchanged in this milestone. No GET response copies it.

Recommended migration, requiring an explicit contract change decision:

1. Mark v1 `id` as deprecated in client-facing documentation now. New client code
   must use `code` for navigation, storage, and API requests; never store the UUID
   as a room-scoped user identity or use it for authorization.
2. Update any known clients and shared response types to use `code` and tolerate
   the absence of `id`. Confirm compatibility through client contract tests and
   release/support windows, without logging credentials or ghost identities.
3. Introduce a versioned create response (for example, a future v2 API) that omits
   `id`. Keep the existing v1 shape during the agreed migration window.
4. Retire the old response only after the human owners approve the compatibility
   window and supported clients have migrated. Do not silently remove or repurpose
   `id` on v1.


## Messaging

Message history is documented in `docs/api/messages.md`; Socket.IO subscriptions and
text sends are documented in `docs/websocket/messaging.md`. They require the same
anonymous credential, accessible room, and ACTIVE membership. Public participant IDs
are available in messaging subscription acknowledgements and message authors; no
fields are added to existing room responses in this milestone.


## Rate limits and physical cleanup

Room creation and join attempts now enforce configurable identity/network limits.
An ACTIVE duplicate join still preserves membership but counts as an attempt.
Exhaustion returns the existing error envelope with 429 RATE_LIMITED plus
retryAfterMs, and a Retry-After header in seconds. Success response shapes are
unchanged. Anonymous identity creation is network-limited as well.

Expired rooms remain inaccessible immediately. Default cleanup starts one hour after
expiresAt and runs in bounded batches; after final room deletion, reads/joins return
404 rather than logical 410. See `docs/operations/messaging-safety.md` for limits,
retention timing, and process-local deployment constraints.
