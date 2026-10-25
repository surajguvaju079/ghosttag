# Messaging safety operations

## Development migration confirmation

Before changing a configured database, establish the effective NODE_ENV and sanitized
DATABASE_URL host/port/database/user (never print the password). Match the target to
the repository's Docker Compose service, container labels, published port and database
identity. Matching PostgreSQL version, data directory and pg_postmaster_start_time
through both the configured connection and docker exec establishes that it is the
same instance. A localhost address alone is insufficient (it could be a tunnel).
Do not run migrations when this identity or environment is ambiguous.

On 2026-10-18, this checkout was confirmed as development, localhost:5432/ghosttag,
user ghosttag, matching the repository's ghosttag-postgres Compose container. The
pending public-identifier migration and the new report/index migration were applied
only there. Prisma migrate status and schema diff confirmed compatibility. No
production/staging connection or data was changed.

After independently confirming the target, available commands are:

```sh
pnpm --filter @ghosttag/api exec prisma migrate status
pnpm --filter @ghosttag/api exec prisma migrate deploy
pnpm --filter @ghosttag/api exec prisma generate
pnpm --filter @ghosttag/api exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

The new migration is `20261018010000_message_reports_and_retention`: a private
message_reports table and an expiresAt/id room index. Apply migrations before
rolling out the new application. It does not delete existing content by itself.
Retention starts when the application starts unless explicitly disabled.

## Rate-limit configuration

Defaults and policy names are defined in `docs/architecture/messaging-safety.md`.
For any enabled dimension, override these environment variables:

* `SAFETY_<POLICY>_IDENTITY_LIMIT`
* `SAFETY_<POLICY>_NETWORK_LIMIT`
* `SAFETY_<POLICY>_WINDOW_MS`

Policies: IDENTITY_CREATE, ROOM_CREATE, ROOM_JOIN, MESSAGE_SEND, MESSAGE_BURST,
WS_CONNECT, WS_SUBSCRIBE, MESSAGE_REPORT. IDENTITY_CREATE has only a network
dimension; MESSAGE_BURST only an identity dimension. Variables for absent dimensions
do not enable new dimensions. Enabled limits must be positive integers (zero does
not disable safety). Windows must be 1–86400000 ms. Invalid settings fail startup.
`SAFETY_MAX_BUCKETS` defaults to 20000 and caps process memory cardinality; saturation
fails closed instead of evicting active counters. Increasing limits is an operator
capacity decision. Examples:

```dotenv
SAFETY_MESSAGE_SEND_IDENTITY_LIMIT=30
SAFETY_MESSAGE_SEND_NETWORK_LIMIT=120
SAFETY_MESSAGE_SEND_WINDOW_MS=60000
SAFETY_MESSAGE_BURST_IDENTITY_LIMIT=5
SAFETY_MESSAGE_BURST_WINDOW_MS=1000
SAFETY_MAX_BUCKETS=20000
```

Identity limits use authenticated server-derived identity, not socket IDs or client
fields, and apply across rooms and reconnects. Network keys use the actual transport
peer, canonicalizing mapped IPv4 and grouping IPv6 by /64. Forwarding headers are
ignored. NAT/proxy users share a quota; rotating IP networks can bypass a network-only
quota. Behind a reverse proxy, all clients may share the proxy address: configure
appropriate edge limits and review a trusted-address adapter before deployment.
Changing Express trust proxy alone does not change this direct-peer limiter.
Do not trust arbitrary X-Forwarded-For values.

REST identity-scoped limits run after authentication; invalid credentials and routes
without a policy still need edge-level request controls. Socket connection attempts
are limited at namespace authentication, not at the TCP/TLS/Engine.IO handshake.
These controls do not replace ingress connection limits. Live fanout still supports
one API instance. Counters are process-local and reset after restart; multiple
instances multiply quotas. Use a shared limiter before horizontal scaling (no Redis
is introduced in this milestone). Fixed windows permit boundary bursts. Limiter
keys use random per-process HMAC salts and are never logged or exposed.

## Cleanup schedule and recovery

| Variable | Default | Accepted values |
| --- | --- | --- |
| RETENTION_ENABLED | true | true or false |
| RETENTION_GRACE_MS | 3600000 | 1–604800000 ms |
| RETENTION_INTERVAL_MS | 60000 | 1–86400000 ms |
| RETENTION_BATCH_SIZE | 100 | 1–1000 parent rows per phase |
| RETENTION_CHUNKS_PER_SWEEP | 10 | 1–100 room chunks |

Logical expiry remains immediate at expiresAt. Content becomes physically eligible
one hour later by default. The enabled runner sweeps at startup and every minute;
it skips overlapping runs, resumes partial rooms, and waits for its current run
when shutting down. Each chunk is a transaction holding the parent room lock.
Failure rolls back that chunk and emits only a generic warning; later sweeps retry.
Another worker's locked room is skipped, not waited on. Parent batches and chunk
budgets bound work; cascading foreign keys can delete additional dependent rows.
Existence checks avoid counting entire backlogs between chunks.

Messages/reactions/reports and polls/votes are removed before memberships; the room
is deleted last. Anonymous identities and credentials are not deleted. Partial
cleanup is safe because the expired room is already inaccessible. Requests return
410 before physical room deletion and 404 afterward. Deleted room codes can later
be reused; socket subscriptions bind the actual room/membership internally and
message delivery re-resolves persisted content in that room.

Physical deletion is not guaranteed exactly at the grace deadline: downtime,
content volume, transaction failures or bounded throughput can delay completion.
Restart the API to resume timestamp-selected backlog. Setting RETENTION_ENABLED=false
stops automatic physical cleanup but never makes expired content accessible. Do not
leave it disabled without an operational deletion process. To inspect backlog without
reading content, query counts and the oldest expired expiresAt (using an operator's
properly scoped database connection):

```sql
SELECT count(*) AS expired_rooms, min("expiresAt") AS oldest_expiration
FROM "rooms"
WHERE "expiresAt" <= CURRENT_TIMESTAMP - INTERVAL '1 hour';
```

Adjust that interval to the configured grace. Monitor this backlog, database health
and generic retention warnings; no content, room/user IDs or credentials need be
logged. Backups, replicas, database WAL and client copies have separate retention
policies; application DELETE does not promise forensic erasure of those copies.

## Moderation boundaries and privacy

Reports are private metadata, not archived evidence. They cascade with the message
or reporter membership, use the same room cleanup schedule, and contain no duplicate
message text. Before deletion only privileged, least-privilege database operators
may inspect reports; operational access auditing is required. The application adds
no moderator identity, report-list endpoint, dashboard or automated enforcement.
Human review must occur within the retention window. Durable evidence retention
would require an explicit product/privacy decision.

HTTP logs contain route templates and status codes, not URLs, query strings,
parameters, headers, body content or exception messages. Log correlation IDs are
UUIDs; other client request-ID values remain in the existing HTTP response contract
but are replaced by generated UUIDs in logs. Raw IPs, rate keys, reporter identities,
message contents and credentials are not logged by the new controls. Deployment
proxy/database logging must follow the same privacy policy. Already queued socket
packets or client-held data cannot be recalled after leave, expiry or revocation.

## Verification

API unit tests and PostgreSQL/Socket.IO integration tests cover quotas/reset,
network normalization, memory bounds, reconnects, concurrent sends, reports/isolation,
cleanup cascades, bounded progress, restart recovery and lock coordination. Suites
create/drop only their own temporary databases. Existing HTTP and messaging suites
suppress the automatic cleanup runner to keep test lifecycle boundaries deterministic;
retention itself is exercised explicitly by dedicated tests. A fresh real limiter
isolates dedicated safety cases; existing room fixtures raise only their aggregate
fixture-creation network budget. Production defaults remain enabled.
