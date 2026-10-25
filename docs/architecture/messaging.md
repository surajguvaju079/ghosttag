# Room messaging foundation

## Decisions (recorded before implementation)

Use the documented NestJS + Socket.IO transport, namespace `/rooms`, websocket
transport only. PostgreSQL remains authoritative; no Redis or queue is introduced.
One API instance owns live connections in this foundation. Multiple instances can
persist and serve history safely, but cross-instance live fanout needs a later design.

Memberships gain an immutable, random `publicId` (`p_` plus an independently generated UUIDv4 rendered as 32 hex digits),
unrelated to the internal membership UUID or anonymous user. Each room membership
gets independent randomness, preserving its public ID across leave/rejoin. Messages
gain independent immutable `publicId` values (`m_` plus an independently generated UUIDv4 rendered as 32 hex digits).
Database defaults backfill existing rows and generate values for all writers.
These values identify public objects, never authorize access. Existing room response
shapes remain unchanged; subscription acknowledgements and message authors expose
participant IDs. Names may collide; participant IDs distinguish their authors.

Messages gain nullable `clientMessageId`, with a unique `(membershipId, clientMessageId)`
constraint. New sends require a client UUIDv4. Null supports pre-existing messages.
Identical retries return the persisted message without a second broadcast; different
text with the same key returns 409. Every retry still requires current authorization.
Send takes the existing exclusive room lock, so concurrent sends/retries and leaves
are serialized. A message is committed before any delivery is attempted.

Authentication uses existing opaque anonymous bearer credentials and SHA-256 hashes.
A shared credential verifier serves HTTP and sockets. Socket state retains the
credential hash instead of the raw token, never trusts client user IDs, and
revalidates the database credential for every event.
Authorization transactions lock credential rows `FOR SHARE` then the room row using
the existing room lock protocol. Reads and deliveries use `FOR SHARE`; sends use
`FOR UPDATE`. Credential mutation must update/delete its database row; membership
writers must lock the parent room first, as already required by room lifecycle.

Subscriptions are server-owned per-socket sets, not authorization inferred from
Socket.IO rooms. Subscribe checks lifecycle and ACTIVE membership. Unsubscribe clears
local state without requiring an accessible room (cleanup must work after expiry).
Before each delivery, recheck that recipient's credential and membership under shared
locks, then enqueue the event while the locks remain held. Recheck wall-clock expiry
at enqueue time too. Fail closed on verification/database errors. This orders enqueue
before a concurrent leave/revocation/lock commit; packets already queued while
permitted cannot be recalled and can arrive later. Socket.IO rooms are never used
for unchecked broadcasts. A one-second sweep invalidates stale subscriptions and
disconnects invalid credentials; correctness never depends on the sweep interval.
No message contents, ghost identities, or credentials are logged.

History uses authenticated HTTP, current ACTIVE membership, lifecycle checks, and
credential/room locks. Order is `(createdAt DESC, publicId DESC)`. The `before` cursor
is the opaque public message ID, resolved within the authorized room; Prisma's database
cursor preserves PostgreSQL timestamp precision. Fetch `limit + 1` rows to return
`nextCursor` only when another page exists. No internal UUID or encoded internal ID
is a cursor. A compound index supports the ordering. History includes earlier room
messages for ACTIVE rejoining members; the product has no per-join history boundary.

Acknowledgement/push delivery is best effort after commit. Disconnects, crashes or
network loss can miss live events; retry the same clientMessageId and fetch history.
Reconnect reauthenticates and starts with no subscriptions; explicitly resubscribe.
There is no claim of durable fanout, exactly-once delivery, or replay of missed pushes.
Clients deduplicate by messageId. Configurable rate limits, private reports and
retention workers are now documented in docs/architecture/messaging-safety.md.
Multi-instance delivery and advanced moderation remain separate milestones.


## Local leave invalidation

RoomService notifies local listeners only after a leave transaction commits, including
idempotent repeat leaves. The gateway synchronously cancels the user's pending and
active subscriptions for that code. This prevents a quick local leave/rejoin from
silently restoring the old subscription. Connection-local generation tokens prevent
an old delivery/sweep/unsubscribe from acting on a newer subscription. Database
checks still enforce delivery if leave was changed by another writer/process. A
transient leave/rejoin entirely outside this API process may not be observed by the
sweep, which is another reason live multi-process operation is not supported here.

## Migration and deployment

`20261018000000_message_public_identifiers` adds membership/message public IDs,
nullable message retry keys, unique indexes, and the history-order index. Defaults
backfill independent IDs for existing memberships/messages; existing messages have
null retry keys. Run `prisma migrate deploy` and regenerate Prisma before rolling
out this application version. Existing public REST response fields are unchanged.
Tests apply all migrations to disposable PostgreSQL databases. Existing application
data is not migrated as a side effect of running the tests.

Verification: API `test --runInBand`, `test:e2e --runInBand`, `exec tsc --noEmit`,
`build`, and targeted ESLint. Integration tests start real Socket.IO clients and
HTTP endpoints against a migrated temporary database and remove it on teardown.


## Retention-safe delivery

Subscriptions retain the internal room and membership identity along with their
connection generation. A recycled public room code cannot silently reuse that
binding. Each push re-resolves the persisted public message ID within the authorized
room; a message deleted before enqueue is not emitted from an in-memory cached
payload. Existing per-recipient credential/room locks remain held during enqueue.
No public room/message response fields change.
