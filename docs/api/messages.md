# Message history API

`GET /api/v1/rooms/:code/messages?limit=50&before=m_<32-hex-digits>`

Authentication: `Authorization: Bearer <anonymous-identity-token>`.
Requires an accessible room and the caller's ACTIVE membership. Codes are normalized
and validated as documented in `docs/websocket/messaging.md`. There is no implicit
join and no ability to supply another user's identity. Current ACTIVE members can
read earlier messages, including messages from participants who have since left.

`limit` is an integer string from 1 through 100, default 50. `before` is optional
and must identify a message in this room. Unknown query fields, arrays, malformed
values, unknown cursors and cursors from other rooms are rejected. Cursor failures
share the generic `400 INVALID_CURSOR` response; they do not reveal another room.

Success: `200 OK`, `Cache-Control: no-store`:

```json
{
  "messages": [
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
  ],
  "nextCursor": null
}
```

Order is newest first by database `(createdAt DESC, publicId DESC)`, retaining
PostgreSQL timestamp precision for pagination. An older page excludes the cursor
message itself. `nextCursor` is the last returned public message ID only when
another page exists; otherwise null. Empty rooms return `messages: []` and null.
No internal UUID, encoded internal ID, global participant key, or credential is a
cursor or response field. Public message/participant IDs match Socket.IO payloads.

History rechecks the credential and room/membership inside the authorization
transaction; shared locks coordinate with concurrent leave, revocation and room
updates. Access is evaluated at the operation, not guaranteed after response delivery.

Errors use the existing REST exception envelope (`statusCode`, `code`, `message`,
`path`, `timestamp`, `requestId`). Authentication, membership, room and lifecycle codes
are the same as messaging sockets. Additional history errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_PAGINATION` | Limit has invalid type/range |
| 400 | `INVALID_CURSOR` | Malformed, unknown or out-of-room cursor |
| 400 | `INVALID_MESSAGE_PAYLOAD` | Malformed query or unsupported keys |

See `docs/websocket/messaging.md` for send/retry, event, and reconnection contracts.
Existing create/join/leave/room-read endpoints retain their response shapes. The new
public participant ID is exposed through subscription acknowledgements and message
authors; this milestone does not add fields to the existing REST participant list.


## Safety and retention

Sending is throttled through Socket.IO; a new-message frequency limit supplements
attempt limits while preserving idempotent retries. Invalid/blank text and the
2,000 UTF-16-unit maximum remain enforced. Abuse reports use
`POST /api/v1/rooms/:code/messages/:messageId/reports`, documented in
`docs/api/message-reports.md`. No reporter data is included in message history.

Expiration denies history immediately. After the default one-hour grace, bounded
cleanup physically deletes expired content and ultimately its room. A purged room
returns 404 rather than 410; grace and backlog never grant continued access.
Operational settings are documented in `docs/operations/messaging-safety.md`.
