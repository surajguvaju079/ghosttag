# ADR 0004: Use PostgreSQL with Prisma

## Status

Accepted

## Date

2026-08-18

## Context

The original GhostTag product requirements described Firebase as the database
platform.

The technical architecture has since been evaluated for the requirements of
the product.

GhostTag requires structured relationships between:

- Internal identities
- Rooms
- Room memberships
- Messages
- Polls
- Votes
- Reactions
- Reports
- Blocks
- Moderation records
- Temporary lifecycle state

The system also requires strong server-side guarantees around:

- Room membership
- Poll voting
- Duplicate vote prevention
- Authorization
- Data consistency
- Expiration state
- Moderation

## Decision

GhostTag will use:

```texta
PostgreSQL
    +
Prisma

PostgreSQL is the authoritative persistent database.

Prisma is the primary database access layer for the NestJS backend.

Reasons
Relational Data Model

GhostTag has several naturally relational entities.

For example:

User
  │
  ├── RoomMembership
  │       │
  │       └── Room
  │              │
  │              ├── Message
  │              ├── Poll
  │              └── Reaction
  │
  └── Report

A relational database provides strong constraints and relationships for these
operations.

Data Integrity

PostgreSQL provides transactions, constraints, indexes, unique constraints,
and foreign keys.

These are important for operations such as preventing duplicate poll votes.

Server Authority

The backend remains responsible for all important data mutations.

This fits the GhostTag architecture better than relying heavily on
client-driven database synchronization.

Query Flexibility

PostgreSQL provides flexible querying and aggregation capabilities useful for:

Aftermath summaries
Poll results
Moderation
Analytics
Room statistics
Message-related queries
Prisma

Prisma provides:

Type-safe database access
Schema management
Migrations
Generated TypeScript types
Good integration with NestJS
Alternatives Considered
Firebase / Firestore

Firebase was specified in the original PRD.

It was not selected for the current architecture because GhostTag's backend
requires strong server-side control over relational data, authorization,
transactions, and domain logic.

Realtime communication will instead be handled explicitly through Socket.IO.

Firebase may be reconsidered if a future product requirement provides a
strong reason to use it.

MongoDB

MongoDB provides flexible document storage and can work well with Node.js.

It was not selected because GhostTag's core data model contains many
relationships and requires strong consistency guarantees around operations
such as membership and voting.

MySQL

MySQL is technically viable.

PostgreSQL was selected because of its feature set, ecosystem, and suitability
for the application's relational and analytical requirements.

Consequences
Positive
Strong relational integrity
Transactions
Constraints
Flexible queries
Type-safe Prisma access
Clear migration workflow
Good fit for the domain model
Negative
Requires database schema management
More explicit schema design than a document database
Requires database infrastructure
Data Ownership

PostgreSQL is the source of truth for persistent application data.

Redis must not become a second authoritative database.

Migration Rules

All schema changes must be made through Prisma migrations.

Existing migrations must not be rewritten or deleted to solve migration
problems.

Create a new migration for schema changes.

Constraint

Do not introduce another primary database without a documented architectural
decision.
