# GhostTag — System Architecture Overview

## 1. Purpose

This document defines the high-level technical architecture of GhostTag.

It is the canonical reference for how the major parts of the GhostTag system
fit together.

Detailed API contracts, database schemas, WebSocket events, and architectural
decisions are documented separately.

---

# 2. Product Context

GhostTag is a temporary social network focused on anonymous, low-pressure
social interaction.

Core philosophy:

> Meet someone. Talk freely. Make a moment. Then disappear.

The system is designed around:

- Temporary identities
- Temporary rooms
- Anonymous interaction
- Real-time communication
- Automatic expiration
- Privacy by design
- Safety and moderation

---

# 3. Architecture Style

GhostTag uses a **modular monolith** architecture.

The initial system is intentionally not split into microservices.

```text
                    ┌─────────────────────┐
                    │   React Native App  │
                    │       + Expo        │
                    └──────────┬──────────┘
                               │
                     REST / WebSocket
                               │
                               ▼
                    ┌─────────────────────┐
                    │     NestJS API      │
                    │   Modular Monolith  │
                    └──────┬────────┬─────┘
                           │        │
                    ┌──────▼───┐ ┌──▼──────┐
                    │PostgreSQL│ │  Redis  │
                    │ + Prisma │ │          │
                    └──────────┘ └────┬─────┘
                                      │
                                  BullMQ
                                      │
                                      ▼
                               ┌─────────────┐
                               │   Workers   │
                               └─────────────┘



The architecture should remain simple until actual scale or product
requirements justify additional infrastructure.

4. Technology Stack
Mobile
React Native
Expo
Expo Router
TypeScript
Backend
NestJS
Node.js
TypeScript
Database
PostgreSQL
Prisma
Realtime
Socket.IO
Temporary State and Infrastructure
Redis
BullMQ
Development
pnpm workspaces
Docker
GitHub Actions
5. Monorepo Architecture

The repository contains both applications and shared packages.

ghosttag/
│
├── apps/
│   ├── api/
│   │   └── NestJS backend
│   │
│   └── mobile/
│       └── React Native / Expo application
│
├── packages/
│   ├── types/
│   │   └── Shared TypeScript contracts
│   │
│   ├── validation/
│   │   └── Shared validation schemas
│   │
│   └── config/
│       └── Shared configuration/constants
│
└── docs/
    └── Technical documentation
Boundaries

The mobile application must not import backend implementation code.

The backend must not import mobile implementation code.

Shared packages may be consumed by both applications when the code is
genuinely shared.

Business logic must remain inside the application that owns it.

6. Backend Architecture

The backend is a NestJS modular monolith.

High-level modules:

apps/api/src/


├── auth/
├── rooms/
├── ghosts/
├── messages/
├── polls/
├── reactions/
├── moderation/
├── aftermath/
├── jobs/
└── common/

The exact module structure may evolve as the product develops.

Each domain module should own its business logic.

For example:

rooms/
├── rooms.module.ts
├── rooms.controller.ts
├── rooms.service.ts
├── rooms.repository.ts
├── dto/
└── ...

Controllers handle HTTP transport.

WebSocket gateways handle realtime transport.

Services contain business logic.

Repositories/data-access layers handle persistence.

7. Request Flow

A normal REST request follows:

Mobile
   │
   │ HTTPS
   ▼
NestJS Controller
   │
   ▼
Validation
   │
   ▼
Service
   │
   ├───────────────┐
   ▼               ▼
Repository       Redis
   │
   ▼
PostgreSQL

The server is authoritative for:

Identity
Authorization
Room membership
Room expiration
Message ownership
Poll voting
Moderation
Rate limits

The client must never be treated as authoritative.

8. REST vs WebSocket

GhostTag uses both REST and WebSockets.

REST

REST is used for operations such as:

Anonymous authentication
Creating rooms
Joining rooms
Loading room information
Loading message history
Creating polls
Voting
Reporting
Blocking
Loading aftermath data

REST is the primary request/response interface.

WebSocket

Socket.IO is used for realtime events such as:

New messages
Reactions
New polls
Poll updates
Ghost joining
Ghost leaving
Room expiration
Room cooldown events

The WebSocket layer should handle transport and connection concerns.

Business logic should remain in domain services.

9. Realtime Architecture

A simplified room connection:

Mobile
   │
   │ Socket.IO
   ▼
NestJS WebSocket Gateway
   │
   ▼
Room Service
   │
   ├── PostgreSQL
   │
   └── Redis

A user joins a Socket.IO room corresponding to the GhostTag room.

Example:

ghosttag:room:GH-4829

Realtime events are broadcast only to authorized members of the room.

The server must verify that a client is allowed to access a room before allowing
it to subscribe to that room's realtime events.

10. PostgreSQL

PostgreSQL is the source of truth for persistent application state.

It stores authoritative data such as:

Users/internal anonymous identities
Rooms
Room memberships
Messages
Polls
Poll votes
Reactions
Reports
Blocks
Aftermath-related data

Prisma is used as the database access layer.

All schema changes must be made through Prisma migrations.

11. Redis

Redis is not the primary database.

Redis is used for fast or temporary state such as:

Presence
Rate limiting
Caching
Pub/Sub
WebSocket scaling support
BullMQ infrastructure
Other short-lived state

If data must remain authoritative and recoverable, it belongs in PostgreSQL.

Redis data should be considered disposable unless explicitly documented
otherwise.

12. Background Jobs

BullMQ is used for asynchronous and scheduled work.

NestJS
   │
   ▼
BullMQ
   │
   ▼
Redis
   │
   ▼
Worker

Potential jobs include:

Room expiration
Room cleanup
Aftermath generation
Moderation processing
Data cleanup
Future notifications

Critical expiration behavior must not depend solely on an in-memory timer
inside an API process.

Expiration must be based on persistent timestamps and background processing.

13. Room Lifecycle

Rooms are temporary.

A simplified lifecycle:

                    ┌─────────┐
                    │ CREATED │
                    └────┬────┘
                         │
                         ▼
                    ┌─────────┐
                    │ ACTIVE  │
                    └────┬────┘
                         │
                  expiresAt reached
                         │
                         ▼
                    ┌─────────┐
                    │ EXPIRED │
                    └────┬────┘
                         │
                    background job
                         │
                         ▼
                    ┌─────────┐
                    │ CLEANUP │
                    └─────────┘

When a room expires:

The room becomes unavailable to users.
New interaction is rejected.
Realtime clients receive a room-expired event.
Aftermath processing may occur.
Cleanup is performed asynchronously according to the data-retention
policy.

User-facing expiration and physical database cleanup are separate concepts.

14. Anonymous Identity Architecture

GhostTag does not expose a permanent public identity.

There are two separate concepts:

Internal Identity
        │
        ├── Authentication
        ├── Authorization
        ├── Abuse prevention
        └── Rate limiting


Public Ghost Identity
        │
        └── Temporary identity inside a room

Example:

Internal identity:
anonymousUserId = internal identifier


Public identity:
👻 midnight_fox

The public Ghost identity is scoped to a room.

A Ghost name must not be treated as a global unique identity.

The same generated Ghost name appearing in two rooms does not imply that
the users are the same person.

15. Authentication

GhostTag uses anonymous authentication.

The client does not require:

Email
Phone number
Public username
Password-based registration

A simplified flow:

Mobile
   │
   │ POST /auth/anonymous
   ▼
NestJS
   │
   ├── Create/retrieve internal anonymous identity
   │
   ▼
JWT/session
   │
   ▼
Mobile

The authentication identity exists for security and system purposes.

It must not automatically become a public social identity.

Authentication details are documented separately.

16. Privacy Architecture

Privacy is a core system requirement.

The architecture should minimize unnecessary personal information.

Do not introduce permanent social identity unless explicitly approved as a
product decision.

The server may maintain technical identifiers required for:

Security
Abuse prevention
Rate limiting
Moderation
Fraud prevention

Such identifiers must never be exposed as public identity.

17. Authorization

Authorization must always be performed server-side.

Examples:

Can this user join this room?


Can this user send a message?


Can this user vote in this poll?


Can this user react to this message?


Can this user access this aftermath?


Can this user perform this moderation action?

The client must not be trusted to answer these questions.

The server derives the authenticated identity from the authentication context.

Client-provided identity fields must not be used as the source of truth.

18. Moderation Architecture

Anonymous interaction requires server-side safety controls.

The architecture supports:

Reporting
Blocking
Rate limiting
Spam prevention
Content moderation
Room cooldowns
Abuse detection
Administrative moderation

Moderation is part of the core architecture rather than a later optional
feature.

19. Data Flow Example — Sending a Message
Mobile
   │
   │ WebSocket: message:send
   ▼
Message Gateway
   │
   ▼
Authentication
   │
   ▼
Authorization
   │
   ▼
Validation
   │
   ▼
Message Service
   │
   ├── Rate limit check → Redis
   │
   ├── Persist message → PostgreSQL
   │
   └── Broadcast event → Socket.IO
                         │
                         ▼
                    Room members

The message should not be considered successfully created merely because the
client sent the WebSocket event.

The server must validate and persist the message before broadcasting the
authoritative event.

20. Data Flow Example — Voting
Mobile
   │
   │ POST /polls/:id/vote
   ▼
Poll Controller
   │
   ▼
Authentication
   │
   ▼
Authorization
   │
   ▼
Validation
   │
   ▼
Poll Service
   │
   ├── Check poll state
   ├── Check room membership
   ├── Prevent duplicate vote
   └── Persist vote
            │
            ▼
       PostgreSQL
            │
            ▼
       Poll result

Duplicate voting must be prevented server-side.

21. Error Handling

The API should expose predictable structured errors.

Internal implementation details must not be exposed to clients.

Examples of errors include:

Unauthorized
Forbidden
Room not found
Room expired
Invalid room code
Already voted
Rate limited
Message rejected
User blocked
Room locked

The exact API error format is defined in:

docs/api/conventions.md
22. Scalability Strategy

GhostTag should initially optimize for development speed and architectural
clarity rather than premature distributed infrastructure.

Initial deployment:

Load Balancer / Reverse Proxy
            │
            ▼
       NestJS API
         │    │
         │    └── Redis
         │
         └────── PostgreSQL


       BullMQ Worker
            │
            └── Redis

Multiple API instances can be introduced when needed.

Redis can support shared realtime infrastructure between instances.

PostgreSQL remains the source of truth.

Do not introduce microservices merely because the application uses realtime
communication.

23. Deployment Principles

All production services should be reproducible through documented
configuration.

Secrets must be provided through environment variables or a secret-management
system.

Secrets must never be committed to Git.

The application should be containerizable.

Development should support local infrastructure through Docker where practical.

24. Observability

The system should eventually provide:

Structured application logs
Error tracking
Request tracing where useful
Basic performance metrics
Background job monitoring
WebSocket connection monitoring

Observability should not expose private user content unnecessarily.

Logging must avoid sensitive authentication credentials and secrets.

25. Architecture Boundaries

The following boundaries should be preserved:

Mobile
  │
  ├── UI
  ├── Client state
  └── API/WebSocket clients
           │
           ▼
        NestJS
           │
           ├── Domain/business logic
           ├── Authorization
           ├── Validation
           └── Persistence
                    │
             ┌──────┴──────┐
             ▼             ▼
        PostgreSQL       Redis

The mobile application must not:

Directly access PostgreSQL
Directly access Redis
Implement authoritative authorization
Decide whether a room has expired
Decide whether a vote is valid
Decide whether a user is allowed to perform an operation
26. Architectural Principles
Principle 1 — Server Authoritative

Important business decisions are made by the backend.

Principle 2 — PostgreSQL Is the Source of Truth

Redis is not a replacement for the database.

Principle 3 — Temporary by Design

Temporary product behavior must be represented explicitly in the backend.

Principle 4 — Privacy by Design

Do not create permanent identity unnecessarily.

Principle 5 — Safety by Design

Anonymous systems require strong abuse prevention.

Principle 6 — Modular Monolith First

Keep the system simple until scale requires otherwise.

Principle 7 — Explicit Contracts

API and WebSocket contracts must be documented.

Principle 8 — Background Work Is Asynchronous

Scheduled and expensive work should not block API requests.

Principle 9 — Reuse Before Reinventing

Prefer existing patterns and shared infrastructure over duplicate
implementations.

Principle 10 — Documentation Is Part of the Architecture

Important architectural decisions must be documented so that humans and
coding agents can understand the system without relying on conversation
history.

27. Related Documentation

Detailed information is documented separately.

API
docs/api/conventions.md
Database
docs/database/schema.md
docs/database/conventions.md
WebSocket
docs/websocket/events.md
Architecture Decisions
docs/decisions/
Agent Instructions
AGENTS.md

These documents should be updated when the architecture changes.
