# Socket.IO messaging contract

## Connection and authentication

Connect to the `/rooms` Socket.IO namespace on the API origin, using the default
`/socket.io` Engine.IO path and `transports: ['websocket']`. The HTTP `/api/v1`
prefix does not apply to Socket.IO namespaces. Require TLS (`wss`) in deployment.

```ts
const socket = io(`${apiOrigin}/rooms`, {
  transports: ['websocket'],
  auth: { token: anonymousIdentityToken },
});
```

The token is the existing opaque anonymous credential, not a JWT. The server hashes
it and validates the stored credential, including expiration and revocation. Tokens
in query parameters, cookies, or client user IDs do not establish identity. The
server retains only the credential hash and internal authentication context after
handshake verification and never logs credentials or message contents.

Connection failures emit Socket.IO `connect_error` with a generic message and a
sanitized `error.data = { statusCode, code, message }`. No subscriptions survive a
reconnect. Server-initiated disconnects require the client to obtain/validate its
credential and explicitly reconnect; do not blindly retry revoked credentials.

## Acknowledgements

Pass a Socket.IO acknowledgement callback, or use `emitWithAck` with a timeout.
All three client events return one of:

```json
{ "ok": true, "data": {} }
```

```json
{
  "ok": false,
  "error": { "statusCode": 403, "code": "ROOM_MEMBERSHIP_INACTIVE", "message": "Active room membership is required" }
}
```

For terminal credential failures, the server also emits `session:invalidated` and
disconnects. The acknowledgement may be lost during disconnect; handle the session
event/disconnect as terminal. Unexpected database/application errors use a generic
500 error without implementation details. Payloads must be objects containing only
the documented keys. Codes are trimmed and uppercased, then must match `GH-0000`.
The maximum incoming Socket.IO packet is 16 KiB. Unknown events have no handler.

## Client events

### `room:subscribe`

Payload: `{ "code": "GH-4829" }`.

Success `data`:

```json
{
  "code": "GH-4829",
  "subscribed": true,
  "participant": {
    "participantId": "p_3c6fbafdd8334eb4b159dd64467b77ed",
    "ghostName": "Quiet Raven",
    "ghostAvatar": "raven",
    "role": "MEMBER"
  }
}
```

Requires a current credential, an accessible room, and ACTIVE membership. Repeating
subscribe clears and replaces that socket's subscription after a fresh access check, without joining a second time. A failed replacement leaves no active subscription. It
never creates or reactivates a database membership. An overlapping unsubscribe or
leave can cancel a pending subscribe; its acknowledgement then has `subscribed: false`.

### `room:unsubscribe`

Payload: `{ "code": "GH-4829" }`.
Success: `{ "code": "GH-4829", "subscribed": false }`.

Idempotently removes this socket's subscription immediately. It does not change the
persisted membership. Cleanup is allowed even for inaccessible rooms/nonmembers;
credential validity is still checked. Use the existing REST leave endpoint to leave.

### `message:send`

```json
{
  "code": "GH-4829",
  "clientMessageId": "ec5d660f-429b-4099-89ba-b04ffedfcf10",
  "text": "Hello room"
}
```

Requires a currently valid credential and ACTIVE room membership. Subscription is
optional for sending; subscribe to receive pushes. Text is plain text, nonblank,
and at most 2,000 UTF-16 code units (the JavaScript string length). NUL characters and unpaired UTF-16 surrogates are rejected for PostgreSQL text compatibility. Whitespace is
preserved; clients render text safely as text, never executable markup. A UUIDv4
`clientMessageId` is mandatory; generate once per logical send and reuse on retries.
UUID letter case is normalized. No user ID, author, membership ID or timestamp is
accepted from the client.

Success `data`: `{ "clientMessageId": "...", "replayed": false, "message": <PublicMessage> }`.
A retry with the same membership, key and exact text returns the original message
with `replayed: true`, without reinserting or rebroadcasting. Reusing a key with
different text returns 409. The same key in a different membership is independent.
Retries after leave/lock/expiration/revocation are denied, even if an earlier send
succeeded. Persistence commits before success or any push. A timeout does not mean
the insert failed: retry the original key or recover through history.

## Server events

### `message:created`

Payload is `PublicMessage`:

```json
{
  "messageId": "m_92bcf7715eb24fa1949a75f97711f6d10",
  "code": "GH-4829",
  "text": "Hello room",
  "createdAt": "2026-10-18T12:00:00.123Z",
  "author": {
    "participantId": "p_3c6fbafdd8334eb4b159dd64467b77ed",
    "ghostName": "Quiet Raven",
    "ghostAvatar": "raven"
  }
}
```

Sent only to currently authorized sockets subscribed to that code, including the
author's socket if subscribed. Each recipient is verified independently at enqueue
time. No internal IDs, credential data, or client retry keys are exposed to other
participants. Participants with identical names are distinguished by `participantId`.
IDs have no meaning outside their room and are not authorization credentials.

Pushes are volatile/best effort and may be dropped for disconnected or slow clients.
Concurrent send acknowledgements/pushes may arrive in different order; sort by
`createdAt`, then `messageId`, and deduplicate by `messageId`. History provides the
authoritative order at PostgreSQL timestamp precision; ISO timestamps are rendered
at millisecond precision. Use history order when sub-millisecond ties occur.

### `room:invalidated`

Payload: `{ "code": "GH-4829", "error": { "statusCode": 403, "code": "ROOM_MEMBERSHIP_INACTIVE", "message": "Active room membership is required" } }`.

That subscription has been removed. Local committed REST leaves remove it immediately.
A one-second verification sweep also removes subscriptions after expiration, locks,
inactive membership, or verification failures. Rejoin/unlock does not restore a
removed subscription: explicitly subscribe again after access is restored. A pending
older invalidation cannot remove a newer subscription from an overlapping subscribe.

### `session:invalidated`

Payload: `{ "error": { "statusCode": 401, "code": "IDENTITY_REVOKED", "message": "Anonymous identity has been revoked." } }`.

All subscriptions are removed and the connection is disconnected. Credential
verification/database failures fail closed. No pushes rely on the sweep interval:
every delivery rechecks authorization and wall-clock room/credential expiration.
Credential and room locks order enqueue against revocation, leave, and room updates.
Data already queued while authorized cannot be recalled or erased from a client.

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_ROOM_CODE` | Malformed public code |
| 400 | `INVALID_MESSAGE_PAYLOAD` | Invalid text/key, unexpected fields or malformed payload |
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid credential input |
| 401 | `INVALID_IDENTITY_CREDENTIAL` | Unknown credential |
| 401 | `IDENTITY_REVOKED` | Revoked credential |
| 401 | `IDENTITY_EXPIRED` | Expired credential |
| 403 | `ROOM_MEMBERSHIP_REQUIRED` | No membership in this room |
| 403 | `ROOM_MEMBERSHIP_INACTIVE` | Membership is LEFT |
| 404 | `ROOM_NOT_FOUND` | Well-formed code does not exist |
| 409 | `IDEMPOTENCY_CONFLICT` | Retry key reused with different text |
| 410 | `ROOM_EXPIRED` | Authoritative room expiration reached |
| 423 | `ROOM_LOCKED` | Temporary room lock active |
| 500 | `INTERNAL_SERVER_ERROR` | Sanitized internal/verification failure |

## Reconnection and recovery

Authenticate each new connection and resubscribe to each permitted room. Fetch
`GET /api/v1/rooms/:code/messages` to recover missed messages. Buffer live messages
while fetching history, then merge/deduplicate by `messageId`. Follow older-page
cursors as needed. There is no since-cursor, durable replay stream, delivery receipt,
or exactly-once fanout guarantee. The same retry key returns the same stored message
after reconnect. This milestone supports one live API instance; see
`docs/architecture/messaging.md` for the scaling and delivery limitations.
