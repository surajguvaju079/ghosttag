# ADR 0007: Design the Repository for Agentic Development

## Status

Accepted

## Date

2026-08-18

## Context

GhostTag will be developed using both human developers and coding agents.

Coding agents can implement features quickly, but they require clear and
persistent project context.

Conversation history must not be treated as the long-term source of truth
for architecture or development rules.

The repository itself must contain the information required for agents to
understand and safely modify the system.

## Decision

GhostTag will be explicitly designed for agentic development.

The repository will use:

```text
AGENTS.md
docs/
├── architecture/
├── api/
├── database/
├── websocket/
└── decisions/



AGENTS.md defines general agent behavior and development rules.

Detailed technical documentation lives under docs/.

Architectural decisions are recorded as ADRs.

Agent Workflow

Agents should follow this workflow:

Task
  │
  ▼
Read AGENTS.md
  │
  ▼
Inspect existing code
  │
  ▼
Read relevant documentation
  │
  ▼
Search for existing patterns
  │
  ▼
Implement smallest reasonable change
  │
  ▼
Run verification
  │
  ▼
Review diff
  │
  ▼
Report result
Source of Truth

The repository is the source of truth.

Important decisions must not exist only in:

Chat conversations
Agent memory
Developer assumptions
Temporary prompts

If a decision affects architecture or long-term development, it should be
documented.

Documentation Granularity

Documentation should be split according to responsibility.

AGENTS.md
    ↓
General development and agent rules


docs/architecture/
    ↓
System architecture


docs/api/
    ↓
API contracts and conventions


docs/database/
    ↓
Database schema and conventions


docs/websocket/
    ↓
Realtime contracts


docs/decisions/
    ↓
Architectural decisions and reasoning

Agents should read the documentation relevant to the task instead of
unnecessarily loading the entire repository documentation.

Implementation Rules

Agents should:

Inspect existing code before creating new abstractions.
Reuse established patterns.
Make focused changes.
Preserve unrelated user changes.
Update documentation when behavior or architecture changes.
Run relevant tests.
Run type checking.
Run linting.
Run builds when applicable.
Review the final diff.

Agents must not:

Delete migrations
Commit secrets
Disable tests to make them pass
Silently change architecture
Rewrite unrelated code
Add major dependencies without justification
Claim verification without actually running it
Architectural Changes

Agents must not silently introduce architectural changes.

Examples include:

Replacing PostgreSQL
Introducing another primary database
Introducing microservices
Replacing Socket.IO
Introducing a new queue system
Changing authentication architecture
Changing public identity architecture

Such changes require a documented architectural decision.

Testing

Tests are part of the implementation process.

Agents should prefer adding or updating tests alongside meaningful behavior
changes.

A feature is not considered complete merely because the code compiles.

Verification

Agents must report actual verification results.

Example:

Implementation:
- Added room creation service.
- Added room creation validation.


Verification:
- pnpm typecheck ✓
- pnpm lint ✓
- pnpm test ✓

Agents must never claim a command passed unless it was actually executed.

Human Oversight

Agentic development does not remove human architectural ownership.

Humans remain responsible for:

Product decisions
Architectural decisions
Security decisions
Privacy decisions
Major dependency decisions
Production infrastructure decisions

Agents assist with implementation and verification.

Consequences
Positive
Persistent project context
More predictable agent behavior
Easier onboarding
Better architectural consistency
Reduced dependence on conversation history
Easier collaboration between multiple agents
Negative
Documentation requires maintenance
Agents must be taught to follow repository conventions
Poor documentation can become misleading
Constraint

Documentation must evolve with the codebase.

Outdated documentation is considered a technical problem and should be fixed
when discovered.
