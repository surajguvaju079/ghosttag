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

## Errors

| HTTP | Code | Applies to | Meaning |
| --- | --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | All | Missing or malformed bearer credential |
| 401 | `INVALID_IDENTITY_CREDENTIAL` | All | Unknown credential |
| 401 | `IDENTITY_REVOKED` | All | Credential revoked |
| 401 | `IDENTITY_EXPIRED` | All | Credential expired |
| 403 | `ROOM_MEMBERSHIP_REQUIRED` | Leave | Identity has never joined this room |
| 404 | `ROOM_NOT_FOUND` | Join, leave | Public room code does not exist |
| 410 | `ROOM_EXPIRED` | Join, leave | Room expiration time reached |
| 423 | `ROOM_LOCKED` | Join, leave | Temporary lock has not elapsed |
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
