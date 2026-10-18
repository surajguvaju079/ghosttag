# Message reports

`POST /api/v1/rooms/:code/messages/:messageId/reports`

Authenticate with the existing `Authorization: Bearer <anonymous-token>` credential.
The room code is normalized, and the room must exist, be unexpired and unlocked.
The caller must have ACTIVE membership. `messageId` is the public `m_` identifier,
never an internal message UUID. The message must belong to this specific room.

```json
{ "reason": "SPAM" }
```

Allowed reasons: `SPAM`, `HARASSMENT`, `HATE`, `SEXUAL_CONTENT`, `THREAT`, `OTHER`.
No free-form description, reporter ID, copied content or other fields are accepted.
An ACTIVE owner or member may report; no automatic deletion, ban or lock follows.

Success: `202 Accepted`, `Cache-Control: no-store`:

```json
{ "accepted": true }
```

One report per message and reporter membership is stored. Repeats and concurrent
submissions return the same response without duplicates; the first reason and
creation time are preserved. Repeated attempts still count toward report limits.
The response and socket events never expose the report's internal ID or reporter.
No user-facing report listing, report counts, owner report access or moderation
status endpoint is added.

Errors use the existing REST envelope. Authentication and room/membership lifecycle
errors match message history. Additional errors:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_MESSAGE_ID` | Not a public message identifier |
| 400 | `INVALID_REPORT_REASON` | Missing/unsupported reason |
| 400 | `INVALID_MESSAGE_PAYLOAD` | Unsupported fields or malformed body |
| 404 | `MESSAGE_NOT_FOUND` | Unknown message or message outside this room |
| 429 | `RATE_LIMITED` | Report quota exceeded; includes retryAfterMs and Retry-After |

Reports contain only internal message/reporter-membership references, a reason and
creation time. They retain no copy of the message or ghost identity. Only privileged
database operators can inspect the reports before cleanup; deployment must restrict
and audit that access. Reports cascade away with messages or reporter memberships
and therefore do not outlive room cleanup. See `docs/operations/messaging-safety.md`
for deletion timing, configuration, and operational limitations.
