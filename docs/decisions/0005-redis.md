# ADR 0005: Use Redis for Ephemeral State and Infrastructure

## Status

Accepted

## Date

2026-08-18

## Context

GhostTag requires fast, temporary, and shared state for several parts of the
system.

Examples include:

- Online presence
- Room presence
- Rate limiting
- Temporary room state
- Realtime coordination
- Pub/Sub
- Background job infrastructure
- Future horizontal scaling

PostgreSQL is the authoritative persistent database, but it is not the ideal
storage layer for every short-lived operation.

## Decision

GhostTag will use Redis for ephemeral state and infrastructure.

Redis will not be used as the primary persistent database.

The initial Redis responsibilities are:

```text
Redis
├── Presence
├── Rate limiting
├── Temporary/cache state
├── Pub/Sub
├── Socket.IO scaling support
└── BullMQ infrastructure




Reasons
Fast Access

Redis provides low-latency access to short-lived state.

This is useful for operations such as:

Checking rate limits
Tracking online users
Managing temporary presence
Coordinating realtime systems
Temporary Data

Many GhostTag concepts are inherently short-lived.

Redis is well suited to state where losing the cached/ephemeral value does not
cause permanent data loss.

Rate Limiting

Anonymous systems require strong rate limiting.

Redis provides efficient atomic operations that can be used for distributed
rate limiting.

Realtime Infrastructure

If multiple API instances are introduced, Redis can help coordinate realtime
events between instances.

BullMQ

BullMQ uses Redis as its job queue infrastructure.

Using Redis for both ephemeral application infrastructure and BullMQ avoids
introducing another infrastructure dependency.

Alternatives Considered
PostgreSQL Only

Rejected as the sole infrastructure because high-frequency temporary
operations such as presence and rate limiting should not unnecessarily
increase database load.

In-Memory Node.js State

Rejected for shared application state.

In-memory state:

Is lost when a process restarts
Is not shared between API instances
Makes horizontal scaling difficult

It may still be used for strictly local, non-critical runtime state when
appropriate.

Memcached

Not selected because Redis provides a broader feature set needed by GhostTag,
including:

Atomic operations
Pub/Sub
Data structures
Queue infrastructure through BullMQ
Rate limiting support
Data Ownership

PostgreSQL owns persistent authoritative application data.

Redis owns temporary or infrastructure-related state.

Example:

PostgreSQL
├── Room
├── Message
├── Poll
├── Vote
└── Report


Redis
├── Online presence
├── Rate limit counters
├── Temporary cache
└── Job queue infrastructure

If Redis is unavailable, persistent application data must remain safe.

Expiration

Redis keys containing temporary state should use appropriate TTLs whenever
possible.

The TTL should reflect the actual lifecycle of the data.

Do not use Redis TTL as the only authoritative mechanism for critical product
state.

For example, a room's authoritative expiration time belongs in PostgreSQL.

Redis may cache or accelerate room state, but it must not become the source
of truth for whether the room has expired.

Rate Limiting

Rate limiting should be implemented server-side.

Potential rate-limited operations include:

Anonymous authentication
Room creation
Room joining
Sending messages
Creating polls
Voting
Reports
Swap creation

Exact limits will be defined separately as product/security requirements
mature.

Privacy

Redis must not unnecessarily contain sensitive or permanent personal data.

Temporary identifiers should have appropriate expiration.

Secrets must never be stored in Redis unless explicitly required by a
documented security design.

Failure Behavior

Redis is infrastructure, not the primary source of truth.

If Redis becomes temporarily unavailable:

Persistent PostgreSQL data must remain intact.
The application should fail gracefully.
Features that depend on Redis may become temporarily unavailable if safe
fallback behavior is not possible.
The system must not silently corrupt persistent state.
Consequences
Positive
Fast temporary state
Distributed rate limiting
Realtime coordination
Background job infrastructure
Horizontal scaling support
Reduced PostgreSQL load for ephemeral operations
Negative
Additional infrastructure
Another operational dependency
Requires memory management
Incorrect use can create consistency problems
Constraint

Redis must not become a second primary database.

Any new persistent data requirement must be evaluated for PostgreSQL first.
