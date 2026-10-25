# Messaging safety and retention

## Decisions

Keep existing room/message response shapes and authorization. Add process-local,
fixed-window counters keyed by authenticated internal identity and by direct peer
network. Hash keys with a random process-local HMAC salt; do not retain/log raw IPs,
credentials, identities or content in the limiter. IPv4-mapped IPv6 is normalized to
IPv4, and IPv6 peers share a /64 key. Ignore forwarding headers, which are untrusted
without a deployment-specific proxy configuration. Limits are shared across sockets,
rooms and reconnects within one process. No Redis is added to this single-instance
live deployment. Restarts reset counters; multiple instances multiply allowances.

| Policy | Identity | Network | Window |
| --- | --- | --- | --- |
| IDENTITY_CREATE | none | 10 | 1 hour |
| ROOM_CREATE | 10 | 30 | 1 hour |
| ROOM_JOIN | 30 | 120 | 1 minute |
| MESSAGE_SEND | 30 | 120 | 1 minute |
| MESSAGE_BURST | 5 | none | 1 second |
| WS_CONNECT | 20 | 120 | 1 minute |
| WS_SUBSCRIBE | 30 | 180 | 1 minute |
| MESSAGE_REPORT | 10 | 50 | 1 day |

Attempt limits include rejected requests; authentication precedes identity-scoped
REST limits. Connection network limits apply before credential lookup and identity
limits after verification. Send/subscription attempt limits apply before database
work. MESSAGE_BURST applies only to new messages, under the room transaction, so
identical idempotent retries do not consume new-message frequency capacity. Failed
writes may consume capacity. Combined limit checks/increments are synchronous and
atomic within this JS process. Rejections return 429 RATE_LIMITED and retryAfterMs;
REST also sets Retry-After. Fixed windows can permit bursts across boundaries.
The map holds at most SAFETY_MAX_BUCKETS (default 20000); expired entries are pruned,
and capacity exhaustion fails closed without evicting active entries. No public
reset or limiter inspection endpoint is provided.

## Retention

Expiration remains based on expiresAt, independently of cleanup. After a configurable
one-hour grace following expiration, content is eligible for physical deletion. A
startup sweep and a 60-second timer each perform at most 10 room chunks. Each chunk
locks one expired room FOR UPDATE SKIP LOCKED, ordered by expiresAt/id, and deletes
at most 100 selected message parents, then 100 poll parents. Existing foreign keys
cascade reactions, votes and reports. Only once messages and polls are empty are
at most 100 memberships removed. The room is removed only after those children are
empty. Each chunk commits atomically. Cascades may remove more child rows than the
parent batch size; budgets bound selected parents, not the total cascade fanout.
No anonymous identities or credentials are deleted by room cleanup.

The timestamp query is the durable work queue: startup and subsequent sweeps resume
partially cleaned rooms after restarts or failures. No in-memory timer decides
accessibility. Failure rolls back that chunk and the next run retries. Multiple
workers skip held room locks. Expired ACTIVE rows are included. A backlogged or
stopped API delays physical deletion; operators monitor backlog and schedule runs.
After physical room deletion, existing APIs return 404 instead of logical 410.
Sockets bind subscriptions to the actual room and membership IDs internally, so a
reused public room code cannot reuse an old subscription. Per-delivery authorization
and expiry checks prevent deleted/expired content from being newly enqueued.

## Reporting

Add POST /api/v1/rooms/:code/messages/:messageId/reports. It authenticates and requires
an accessible room and ACTIVE membership. Lookup uses the public message ID and the
resolved room together. The body contains a fixed reason code, never free-form text.
One private report per (message, reporter membership) is stored; repeated submissions
preserve the original reason/time and return the same 202 {accepted:true}. No report,
reporter or internal identifier is returned or broadcast. Unknown/out-of-room message
IDs share MESSAGE_NOT_FOUND. A report creates no automatic moderation punishment.

MessageReport contains internal references only for deduplication/investigation,
a reason and creation time. It stores no message copy, ghost name, IP or token.
Reports cascade with the reported message or reporter membership and never outlive
room content cleanup. This short retention deliberately favors privacy; evidence
is not preserved after cleanup. Privileged database operators can inspect reports
and join to content/reporter membership before deletion. No client, owner, participant
or new HTTP endpoint can list reports. Operator access must be least-privilege and
audited by deployment operations; this milestone adds no moderator credentials,
operator API, archive or dashboard.
