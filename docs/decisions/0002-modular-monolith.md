# ADR 0002: Use a Modular Monolith

## Status

Accepted

## Date

2026-08-18

## Context

GhostTag requires several backend domains:

- Authentication
- Rooms
- Ghost identities
- Messages
- Pulse/polls
- Reactions
- Moderation
- Aftermath
- Background jobs

These domains have clear boundaries, but the initial product does not
require independently deployed services.

Introducing microservices early would increase operational complexity without
providing a demonstrated benefit.

## Decision

GhostTag will initially use a **NestJS modular monolith**.

Each major domain will be represented by a NestJS module.

Example:

```text
apps/api/src/

├── auth/
├── rooms/
├── ghosts/
├── messages/
├── polls/
├── reactions/
├── moderation/
├── aftermath/
└── jobs/



Modules should maintain clear boundaries.

Reasons
Faster development

A modular monolith is faster to develop and debug than a distributed system.

Lower operational complexity

The initial deployment requires fewer services and fewer failure points.

Clear domain boundaries

NestJS modules allow us to structure the application around business
domains without requiring separate deployments.

Suitable for initial scale

GhostTag's initial product goals do not justify the operational cost of
microservices.

Alternatives Considered
Microservices

Rejected for the initial version.

Microservices may be considered later if specific scaling, organizational,
or deployment requirements justify them.

Serverless functions

Rejected as the primary backend architecture because GhostTag requires
persistent realtime connections, domain coordination, and background jobs.

Consequences
Positive
Simple deployment
Easier debugging
Faster development
Clear domain organization
Lower infrastructure complexity
Negative
Backend deployment is initially coupled
Module boundaries must be enforced through code conventions
A poorly structured monolith could become difficult to maintain
Future Migration

If a specific module eventually requires independent scaling or deployment,
its boundaries should allow it to be extracted into a separate service.

This is a future optimization, not an initial requirement.
