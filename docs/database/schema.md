# GhostTag Database Schema

## Status

Draft — Phase 1

## Purpose

This document defines the foundational GhostTag domain model.

The schema is intentionally designed incrementally. Only the core identity,
room, messaging, reaction, and Pulse domains are defined here.

The Prisma schema must implement this document rather than independently
introducing domain decisions.

---

# 1. Core Principles

GhostTag is a temporary social network.

The database design must preserve the following principles:

- No traditional user profile
- No public permanent identity
- Anonymous system identity
- Room-scoped Ghost identities
- Temporary rooms
- Temporary interactions
- Server-authoritative state
- Strong relational integrity
- Privacy by design

---

# 2. Anonymous Identity

## AnonymousUser

`AnonymousUser` represents an internal system identity.

It is not a public social profile.

The identity exists so the backend can:

- Authenticate a client
- Associate activity with an internal identity
- Enforce abuse prevention
- Apply rate limits
- Manage room memberships
- Perform security and moderation operations

The identity must not be exposed to other users as a permanent social identity.

### Conceptual fields

```text
AnonymousUser
├── id
└── createdAt



Additional fields should only be introduced when a concrete requirement
exists.

Privacy Boundary

The internal anonymous identity must not be used as the user's visible
identity inside a room.

A user receives a new room-scoped Ghost identity for every room.

3. Room

A Room is the primary temporary social container.

A room contains:

Members
Messages
Reactions
Pulses
Conceptual fields
Room
├── id
├── code
├── vibe
├── name
├── creatorId
├── status
├── createdAt
└── expiresAt
Room ID

id is the internal database identifier.

It must not be the public room code.

Room Code

code is the short identifier users share to enter a room.

Example:

GH-4829

The room code must be unique.

Vibe

A room has a predefined vibe.

Initial vibes:

DEEP_TALK
CHAOS
RANT_ZONE
GAMER_LOBBY

The system may support custom vibes in the future, but they are not part of
the initial schema.

Name

A room may optionally have a custom name.

Example:

The Dinner Table
Creator

creatorId references the anonymous system identity that created the room.

The creator is not treated as a permanent owner with a separate social
identity.

Room Status

Room lifecycle is represented by an explicit status.

Initial states:

ACTIVE
LOCKED
EXPIRED
Lifecycle
ACTIVE
   │
   │ screenshot cooldown / moderation
   ▼
LOCKED
   │
   │ cooldown ends
   ▼
ACTIVE


ACTIVE
   │
   │ expiresAt reached
   ▼
EXPIRED

A room must never be represented only by an isActive boolean.

Expiration

expiresAt represents the authoritative room expiration time.

The room is considered expired when the current time reaches or passes
expiresAt.

The room's expiration is authoritative in PostgreSQL.

Redis must not become the source of truth for room expiration.

4. Room Membership

RoomMembership connects an anonymous system identity to a specific room.

It is also the boundary for the user's temporary Ghost identity.

Conceptual fields
RoomMembership
├── id
├── roomId
├── userId
├── ghostName
├── ghostAvatar
├── joinedAt
└── leftAt
Room-Scoped Identity

A Ghost identity belongs to a membership.

Example:

AnonymousUser A
    │
    ├── Room A → MidnightFox
    ├── Room B → PurpleGhost
    └── Room C → CoffeeGhost

The same anonymous system identity must not expose the same public Ghost
identity across rooms.

Membership Lifecycle

A membership may represent:

joinedAt
leftAt

If leftAt is null, the member has not left the room.

Membership lifecycle must respect room lifecycle.

An expired room cannot accept new members.

5. Message

A Message represents a text message sent inside a room.

Conceptual fields
Message
├── id
├── roomId
├── membershipId
├── text
└── createdAt
Sender

A message references RoomMembership, not AnonymousUser.

This preserves the room-scoped identity boundary:

AnonymousUser
      │
      ▼
RoomMembership
      │
      ▼
Message

The backend can still resolve the internal identity when required for
security or moderation.

Content

The initial implementation supports:

Text
Emoji

The initial implementation does not support:

Images
Videos
Files
Voice messages

Media may be introduced later through a separate architectural decision.

Editing

Messages are immutable.

Message editing is not supported initially.

Deletion

Users may delete their own messages.

Deleted messages must disappear from the user-facing conversation.

Basic message report retention is now defined in
`docs/architecture/messaging-safety.md`. Reports are private metadata without
content copies and cascade with the reported message or reporter membership.
Longer-lived moderation evidence would require a separate privacy decision.

Lifetime

Messages belong to the lifecycle of their room.

Initially:

message visibility ends with room expiration

Physical cleanup now uses a default one-hour grace after room expiration,
with bounded startup/periodic sweeps. See
`docs/operations/messaging-safety.md` for configuration and recovery.
Message visibility still ends immediately at room expiration.

6. Reaction

Reactions are modeled as a separate entity rather than a JSON/map on a
message.

Conceptual fields
Reaction
├── id
├── messageId
├── membershipId
├── type
└── createdAt
Initial Reaction Types
FIRE
LAUGH
SHOCK
MIND_BLOWN

These correspond to the initial UI reactions:

🔥 😂 😱 🤯
Duplicate Reactions

The system must prevent a member from creating the same reaction type
multiple times on the same message.

Conceptually:

UNIQUE(messageId, membershipId, type)

The database must enforce this constraint.

7. Pulse

A Poll represents a temporary anonymous question inside a room.

The public product name is Pulse.

Conceptual fields
Poll
├── id
├── roomId
├── question
├── optionA
├── optionB
├── createdAt
└── expiresAt
Initial Options

The first version supports exactly two options.

Example:

Should I text my ex?


YES
NO

Arbitrary numbers of options are not part of the initial schema.

Poll Expiration

A poll is votable only while:

now < expiresAt

An expired poll cannot receive new votes.

8. Poll Vote

Votes are stored as individual records.

We do not use authoritative counters such as:

votesA
votesB
Conceptual fields
PollVote
├── id
├── pollId
├── membershipId
├── option
└── createdAt
Vote Identity

A vote belongs to a room membership rather than being publicly associated
with the internal anonymous identity.

The membership is never exposed to other users.

Duplicate Vote Prevention

A member may vote only once on a poll.

The database must enforce:

UNIQUE(pollId, membershipId)

Application-level validation is not sufficient by itself.

The database constraint is authoritative.

Vote Results

Vote results are derived from PollVote records.

Example:

PollVote records
       │
       ▼
COUNT votes
       │
       ▼
YES: 78%
NO:  22%

Vote counters are not the source of truth.

Cached counters may be introduced later as an optimization if required.

Result Visibility

Before voting:

Question
[ YES ]
[ NO ]

After voting:

YES: 78%
NO: 22%

Users should not see the current result before casting their vote.

This prevents existing results from influencing the user's initial choice.

9. Core Relationships

The foundational relationship graph is:

AnonymousUser
     │
     ├───────────────┐
     │               │
     ▼               ▼
  Room            RoomMembership
     │                 │
     │                 ├──────────────┐
     │                 │              │
     ▼                 ▼              ▼
  Poll              Message       PollVote
     │                 │
     ▼                 ▼
 PollVote           Reaction

More explicitly:

AnonymousUser
    │
    ├── creates ──────────────► Room
    │
    └── participates through ─► RoomMembership
                                  │
                                  ├── Message
                                  │      └── Reaction
                                  │
                                  └── PollVote


Room
 ├── RoomMembership
 ├── Message
 └── Poll
        └── PollVote
10. Core Constraints

The database must enforce important invariants.

Room
Room.code is unique
Membership

A system identity should have one active membership for a given room.

The exact constraint will be finalized during Prisma schema design.

Reaction
UNIQUE(messageId, membershipId, type)
Poll Vote
UNIQUE(pollId, membershipId)
Lifecycle

An expired room must not accept new memberships, messages, reactions, polls,
or votes.

Lifecycle enforcement occurs at the application/domain layer, with database
constraints used where appropriate.

11. Source of Truth

PostgreSQL is the authoritative source of truth for:

Anonymous users
Rooms
Room memberships
Messages
Reactions
Polls
Poll votes

Redis may contain temporary or cached state, but must not become the
authoritative database for these entities.

12. Intentionally Deferred

The following domains are intentionally excluded from Phase 1:

Advanced moderation (basic message reporting is now implemented)
Blocks
Screenshot alerts
Rate-limit records
Aftermath
Echo
Swap
Notifications
Device registration
Analytics
Media

These will be designed separately before being added to the database schema.

13. Design Rule

The Prisma schema must implement the domain decisions in this document.

Prisma must not be used to independently decide GhostTag's domain model.

Any change to the foundational domain model must first be reflected in this
document and reviewed before changing the Prisma schema.


## Message reporting and cleanup addendum

The messaging safety milestone adds `MessageReport` with internal `id`, `messageId`,
`reporterMembershipId`, a fixed `reason`, and `createdAt`. The unique
`(messageId, reporterMembershipId)` constraint deduplicates concurrent submissions.
Both foreign keys cascade on deletion. There is no message copy, IP, token or public
reporter identifier. External requests reference the public message ID; clients
receive only `{accepted:true}`. No report-list or moderator API is introduced.

A room `expiresAt/id` index supports timestamp-driven cleanup of expired ACTIVE or
EXPIRED rows. Messages and polls are removed in bounded parent batches before
memberships and the room; dependent reactions, votes and reports cascade. Identities
and credentials are preserved. See `docs/architecture/messaging-safety.md` for the
implementation decisions authorized by this milestone.
