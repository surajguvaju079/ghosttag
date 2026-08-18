# GhostTag — Agent Development Guide

## Project

GhostTag is a temporary social network focused on anonymous,
low-pressure social interaction.

> Meet someone. Talk freely. Make a moment. Then disappear.

Core principles:

- Temporary identity
- Temporary rooms
- Anonymous interaction
- No permanent social graph
- Low social pressure
- Privacy by design
- Safety by design

---

## Repository

```text
apps/
  api/                 # NestJS backend
  mobile/              # React Native + Expo

packages/
  types/               # Shared TypeScript types
  validation/          # Shared validation
  config/              # Shared configuration

docs/
  architecture/
  api/
  database/
  websocket/
  decisions/

Stack
NestJS + TypeScript
React Native + Expo
PostgreSQL + Prisma
Redis
Socket.IO
BullMQ
pnpm workspaces
Docker

See docs/architecture/overview.md for details.

Before Changing Code
Read this file.
Inspect the existing implementation.
Read the relevant documentation under docs/.
Search for existing patterns before creating new ones.
Make the smallest reasonable change.
Run relevant tests.
Run typecheck.
Run lint.
Run build when appropriate.
Review the final diff.
Architecture Rules

GhostTag is a modular monolith.

Do not introduce microservices or major infrastructure without
documenting and justifying the decision.

Controllers should remain thin.

Business logic belongs in services.

Database access belongs in repositories/data-access layers.

WebSocket gateways handle transport concerns and delegate business logic.

PostgreSQL is the source of truth.

Redis is for temporary state, caching, presence, rate limiting,
pub/sub, and job infrastructure.

See the architecture documentation for details.

Privacy

GhostTag uses temporary public identities.

Never expose internal user/device identifiers to clients unless
explicitly required.

Do not introduce permanent public profiles, followers, or usernames
without an explicit product decision.

Agent Safety

Agents MUST NOT:

Delete migrations.
Commit secrets.
Disable tests to make them pass.
Disable lint rules without justification.
Rewrite unrelated code.
Change architecture silently.
Add major dependencies without justification.
Remove existing user changes.
Claim verification without actually running it.

When an architectural decision is required, consult the relevant
documentation or document the decision before implementing it.

Definition of Done

A task is complete only when:

Implementation is complete.
Relevant tests pass.
Type checking passes.
Linting passes.
Build passes when applicable.
Documentation is updated when required.
Final diff has been reviewed.

The agent must report exactly what was changed and what was verified.

Git

Use focused commits:

feat: ...
fix: ...
test: ...
refactor: ...
docs: ...
chore: ...

Before committing:

git status
git diff

Do not mix unrelated changes.

Important

The repository is the source of truth.

Do not rely on conversation history for important architectural
decisions.

Read the relevant documentation before making architectural changes.



## Human Architectural Ownership

GhostTag's core architecture and domain design are owned by the human
developers.

Agents are implementation assistants, not autonomous architectural
decision-makers.

Agents MUST NOT independently change:

- Domain boundaries
- Database architecture
- Identity model
- Privacy model
- Authorization model
- API contracts
- WebSocket contracts
- Core product behavior
- Major infrastructure
- Primary databases
- Authentication architecture

When an implementation requires a decision that is not already documented,
the agent must stop and ask for clarification rather than silently inventing
an architectural solution.

Agents should primarily handle:

- Boilerplate
- Repetitive implementation
- Tests
- DTOs
- Controllers
- Services following established patterns
- Type definitions
- Validation
- Migrations based on an approved schema
- Refactoring
- Documentation updates
- Verification and debugging
