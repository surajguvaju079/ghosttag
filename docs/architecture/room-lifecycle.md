# GhostTag Room Lifecycle

## Purpose

This document defines the lifecycle and accessibility rules for GhostTag rooms.

Rooms are temporary spaces. A room is accessible only while its authoritative expiration time has not been reached.

## Room Lifetime

* A room has a lifetime of 24 hours.
* `Room.expiresAt` is the authoritative expiration boundary.
* Background cleanup must never be relied upon to determine whether a room is accessible.
* Once `expiresAt <= now`, the room is logically expired even if `Room.status` still contains `ACTIVE`.
* Expired rooms cannot be joined or used for room-scoped actions.

## Room Status

The room has two persisted statuses:

* `ACTIVE`
* `EXPIRED`

`EXPIRED` represents persisted lifecycle state and may be updated by cleanup/background processing.

However, authorization and accessibility checks must always evaluate `expiresAt`.

## Temporary Lock

Rooms use `lockedUntil` for temporary locking.

A room is considered locked when:

`lockedUntil > now`

A room automatically becomes accessible when:

`lockedUntil <= now`

No background job is required to unlock a room.

A locked room cannot be joined or used for room-scoped actions.

## Room Membership

Each anonymous user can have at most one membership for a room.

This is enforced by:

`@@unique([userId, roomId])`

A membership has:

* `ACTIVE`
* `LEFT`

Only active memberships count toward room capacity.

### Rejoining

If a user has an existing `LEFT` membership:

* Reactivate the existing membership.
* Set `status` to `ACTIVE`.
* Set `leftAt` to `null`.
* Preserve the existing room-scoped ghost identity.
* Preserve the existing membership role.

Do not create a second membership.

If the membership is already `ACTIVE`, return the existing membership rather than creating another one.

## Room Owner

The room creator receives the first membership with role `OWNER`.

If the owner leaves:

* The room continues to exist.
* The room is not automatically deleted or transferred.
* Their membership becomes `LEFT`.

If the owner rejoins:

* Reactivate the existing membership.
* Preserve the `OWNER` role.
* Preserve their room-scoped ghost identity.

## Room Capacity

MVP room capacity is 50 active members.

Only memberships with:

`status = ACTIVE`

count toward the limit.

`LEFT` memberships do not count toward capacity.

If capacity has been reached, a new member cannot join.

Join and leave operations use a PostgreSQL interactive transaction at `READ COMMITTED`
isolation. Before reading memberships, each operation obtains a row lock with
`SELECT ... FROM "rooms" WHERE "code" = $1 FOR UPDATE`, using a parameterized code.
The lock is held until commit or rollback. Membership lookup, active count, and
membership insert/update all happen inside that transaction after acquiring the lock.

This serializes membership changes per room across API processes. A waiting request's
subsequent queries see the previous transaction's committed membership state. Therefore,
competing first-time joins cannot exceed 50 active memberships, and simultaneous
requests from one identity return the same membership without unique-constraint errors.
The existing unique `(userId, roomId)` constraint remains a database backstop.
Different rooms can proceed independently. Room creation inserts the room and its
OWNER membership in one transaction before other requests can find the room.

All future writers that change room membership must follow the same room-lock protocol.
Check expiration and lock timestamps after acquiring the row lock, since time can pass
while waiting. Return existing ACTIVE membership before counting capacity. Both new
members and LEFT members require an available slot. Leave uses the same lock so joins,
leaves, and reactivations are ordered consistently.

## Room Code

The room code is the public room identifier.

The internal room UUID must not be exposed as the room identifier for client-facing room operations.

Room codes are normalized before lookup:

* Trim surrounding whitespace.
* Convert to uppercase.

Therefore codes such as `GH-4829`, `gh-4829`, and `Gh-4829` resolve to the same room.

## Join Room

### Endpoint

`POST /api/v1/rooms/:code/join`

Authentication:

`Authorization: Bearer <anonymous-identity-token>`

Request body:

None.

### Join Flow

1. Authenticate the anonymous identity.
2. Normalize the supplied room code.
3. Find the room by its public code.
4. Check whether the room exists.
5. Check `expiresAt`.
6. Check `lockedUntil`.
7. Resolve the user's existing membership.
8. If an active membership exists, return it.
9. Verify room capacity before creating or reactivating a membership.
10. If a left membership exists, reactivate it without changing its identity or role.
11. Otherwise create a new MEMBER membership.
12. Generate a room-scoped ghost name and avatar for a new membership.
13. Return the room and membership information.

## Join Errors

### Authentication

`401 AUTHENTICATION_REQUIRED`

No valid anonymous identity credential was provided.

### Invalid Credential

`401 INVALID_IDENTITY_CREDENTIAL`

The supplied anonymous identity credential does not exist.

### Room Not Found

`404 ROOM_NOT_FOUND`

No room exists for the supplied public room code.

### Room Expired

`410 ROOM_EXPIRED`

The current time is at or after `expiresAt`.

### Room Locked

`423 ROOM_LOCKED`

The current time is before `lockedUntil`.

### Room Full

`409 ROOM_FULL`

The room has reached the maximum number of active members.

## Room-Scoped Identity

An anonymous user's global identity is not their visible identity inside a room.

The visible identity is represented by the user's `RoomMembership`.

A user may therefore have different identities in different rooms.

Example:

Room A:

`Quiet Raven`

Room B:

`Neon Fox`

The room membership is the authorization boundary for room-scoped behavior.

## Response

A successful join returns the room and the user's room-scoped identity.

Example:

```json
{
  "room": {
    "code": "GH-4829",
    "vibe": "DEEP_TALK",
    "name": "Late Night Thoughts",
    "expiresAt": "2026-09-08T05:15:00.000Z"
  },
  "membership": {
    "ghostName": "Quiet Raven",
    "ghostAvatar": "raven",
    "role": "MEMBER"
  }
}
```

Join returns no anonymous user UUIDs, room UUIDs, membership UUIDs, or credentials. The pre-existing create-room response is unchanged by this membership implementation.

## Security Principles

* Room codes are public identifiers, not authorization credentials.
* Authentication establishes the anonymous user.
* Membership establishes room participation.
* Room-scoped operations must verify membership.
* Internal database UUIDs are not client-facing identity.
* Expiration must be enforced server-side.
* Lock state must be enforced server-side.
* Client countdowns are informational only and are never authoritative.

## Lifecycle Summary

```text
                    ┌───────────────┐
                    │     ACTIVE    │
                    └───────┬───────┘
                            │
                  expiresAt <= now
                            │
                            ▼
                    ┌───────────────┐
                    │    EXPIRED    │
                    └───────────────┘

Temporary lock:

ACTIVE ── lockedUntil > now ──► temporarily inaccessible
ACTIVE ◄─ lockedUntil <= now ── automatically accessible

Membership:

        ┌──────────┐
        │   NONE   │
        └────┬─────┘
             │ join
             ▼
        ┌──────────┐
        │  ACTIVE  │
        └────┬─────┘
             │ leave
             ▼
        ┌──────────┐
        │   LEFT   │
        └────┬─────┘
             │ rejoin
             ▼
        ┌──────────┐
        │  ACTIVE  │
        └──────────┘

```


## Leave Room

`POST /api/v1/rooms/:code/leave` requires the same anonymous identity credential
as join and accepts no body. Resolve the normalized public code and enforce
expiration and temporary locking before checking membership, even for repeated leaves.

* An ACTIVE membership transitions to LEFT and records the current `leftAt`.
* Preserve ghost name, ghost avatar, role, and original `joinedAt`.
* An existing LEFT membership returns success without changing `leftAt`.
* A user who never joined receives `403 ROOM_MEMBERSHIP_REQUIRED`.
* Success is `204 No Content`, including repeated leave requests.
* Owner departure does not delete the room or transfer ownership.

This idempotent leave behavior is the decision for the previously unspecified repeat
case. No database schema changes are required. Authentication errors include
`401 AUTHENTICATION_REQUIRED`, `401 INVALID_IDENTITY_CREDENTIAL`,
`401 IDENTITY_REVOKED`, and `401 IDENTITY_EXPIRED`. Room accessibility errors
are the same 404, 410, and 423 errors as join.

## Verification

Unit tests: `pnpm --filter @ghosttag/api test --runInBand`.
HTTP/PostgreSQL tests:
`pnpm --filter @ghosttag/api test:e2e --runInBand`.
The room integration suite uses `TEST_DATABASE_URL`, falling back to `DATABASE_URL`
(including `apps/api/.env`). The role must have CREATEDB permission. The suite creates
a uniquely named temporary database, applies all existing migrations, and drops only
that database during teardown. It never truncates or migrates the configured database.
Unavailable PostgreSQL or insufficient privileges cause an explicit test failure.
Tests exercise first joins and reactivations, repeated leaves, authentication, lifecycle
errors, simultaneous same-identity requests, and competing joins for the final slot.
