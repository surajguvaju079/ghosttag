# ADR 0003: Use NestJS for the Backend

## Status

Accepted

## Date

2026-08-18

## Context

GhostTag requires a backend capable of handling:

- Anonymous authentication
- Room management
- Temporary identities
- Real-time messaging
- Anonymous polls
- Reactions
- Moderation
- Background jobs
- Room expiration
- Aftermath generation
- Rate limiting
- API and WebSocket communication

The backend will initially be a modular monolith.

The project also uses TypeScript across the frontend and backend, which allows
shared types and contracts to be used where appropriate.

## Decision

GhostTag will use **NestJS with TypeScript** as its backend framework.

The backend will be located at:

```text
apps/api/



NestJS modules will represent major business domains.

Example:

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
Reasons
TypeScript

Using TypeScript on both mobile and backend provides:

Consistent language
Shared type definitions
Better IDE support
Compile-time safety
Easier agentic development
Modular Architecture

NestJS provides a structured module system that fits the modular monolith
architecture.

Each business domain can have a clear boundary.

Dependency Injection

NestJS dependency injection makes services and infrastructure easier to
organize and test.

REST and WebSocket Support

GhostTag requires both HTTP APIs and real-time communication.

NestJS supports both through its controller and gateway abstractions.

Background Jobs

NestJS can integrate cleanly with BullMQ for asynchronous and scheduled work.

Maintainability

The framework provides conventions for organizing controllers, services,
modules, guards, pipes, interceptors, and other backend concerns.

This is useful for both human developers and coding agents.

Alternatives Considered
Express

Express is lightweight and flexible but provides fewer architectural
conventions.

It was rejected as the primary framework because GhostTag benefits from a
structured modular architecture.

Express may still be used indirectly through NestJS where appropriate.

Fastify

Fastify provides excellent HTTP performance and can be used as a NestJS
adapter.

It may be considered later if HTTP performance requirements justify it.

The framework decision is NestJS; the underlying HTTP adapter is a separate
implementation detail.

Go

Go was considered because of its:

Performance
Concurrency model
Low resource usage
Strong suitability for network services

Go was not selected for the initial backend because:

The rest of the application is TypeScript-based
Shared TypeScript contracts would not be directly reusable
NestJS provides sufficient performance for the expected initial scale
NestJS gives the project a strong modular structure
Agentic development benefits from a single primary application language

Go may be considered for a future independently deployed service if a
specific performance or scaling requirement justifies it.

Python

Python was not selected as the primary backend because GhostTag's initial
backend requirements do not require Python-specific capabilities.

Consequences
Positive
Strong TypeScript integration
Structured backend architecture
Clear module boundaries
Built-in dependency injection
REST and WebSocket support
Good testing support
Good fit for the modular monolith
Agent-friendly conventions
Negative
More framework structure than a minimal Express application
Some NestJS abstractions add complexity for very small features
Node.js remains the runtime
Backend Responsibility

The NestJS backend is authoritative for:

Authentication
Authorization
Room membership
Room lifecycle
Message creation
Poll voting
Reactions
Moderation
Rate limiting
Temporary identity management

The mobile client is never authoritative for these operations.

Constraint

NestJS should not become an excuse for unnecessary abstraction.

Use framework features where they provide clear value.

Prefer simple modules, services, and data-access layers over excessive
abstraction.
