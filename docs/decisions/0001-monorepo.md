# ADR 0001: Use a Monorepo

## Status

Accepted

## Date

2026-08-18

## Context

GhostTag consists of multiple applications and shared code:

- React Native mobile application
- NestJS backend
- Shared TypeScript types
- Shared validation
- Shared configuration

The frontend and backend will evolve together and share API contracts.

GhostTag will also use an agentic coding workflow, where coding agents need
a predictable repository structure and access to the relevant application
and shared code.

## Decision

GhostTag will use a **pnpm workspace monorepo**.

The repository will contain:

```text
apps/
├── api/
└── mobile/

packages/
├── types/
├── validation/
└── config/




Reasons
Shared contracts

Frontend and backend can consume shared TypeScript types where appropriate.

Consistent tooling

Linting, formatting, type checking, and common scripts can be managed
consistently.

Agent-friendly structure

Coding agents can inspect the entire system from one repository while
maintaining clear application boundaries.

Atomic changes

Changes involving both frontend and backend can be developed and reviewed
together.

Simpler development

One repository simplifies local development and onboarding during the
early stages of GhostTag.

Alternatives Considered
Separate repositories

Rejected initially because shared contracts and coordinated frontend/backend
changes would require additional coordination.

Separate repositories may become appropriate in the future if organizational
or deployment requirements justify them.

Turborepo

Not initially required.

pnpm workspaces provide the required workspace functionality without adding
another layer of tooling.

Turborepo may be introduced later if task caching or build orchestration
becomes necessary.

Consequences
Positive
Simple project structure
Shared packages
Easier coordinated development
Agent-friendly repository
Atomic changes
Negative
Repository becomes larger over time
CI configuration requires application-specific jobs
Dependency boundaries must be maintained carefully
Constraint

The monorepo does not mean all code can depend on everything else.

Application boundaries must remain explicit.
