# Temporary room playground

The next social milestone adds a reviewed English content catalog, a shared UTC
daily topic, editable conversation prompts, and two-choice Pulses in both group
and matched rooms. The catalog is server-owned and versioned with the API; there
is no per-person prompt history, streak, score, or permanent social graph.

The daily topic is chosen deterministically from the catalog by UTC day. Reading
it does not persist an event. A prompt is inserted into the local text composer
and becomes an ordinary reportable message only if the member sends it.

The same UTC day also selects one curated collaborative story setup and three
prompts and Pulse choices. The story is previewed on Home and Discover. In a room,
members can place it in the composer with a one-sentence-each instruction; any
contribution is an ordinary message. Choosing any Playground starter appends it
after an existing draft, preserving the draft text. The room refreshes the catalog
after UTC rollover and retries a failed refresh. All Pulse IDs remain accepted
from the full catalog so older clients can still start their known choices.

The room Playground is game-first. A compact card above the chat composer shows
the current game, while the Play menu offers Rock, Paper, Scissors and Antakshari.
Daily prompts, story starters, and Pulses remain under collapsed Ideas. The
old local-only Story relay, Word chain, and Three clues starters are no longer
offered in the room. Games work in group and matched rooms.

One game is active per room. Any active member may start one; the starter or
room owner may end it. A room row lock serializes starts and actions. Game
state and idempotency keys live in PostgreSQL and are deleted with the room.
A public game ID is used in URLs and socket hints. There are no scores,
leaderboards, or permanent player profiles.

Rock, Paper, Scissors lasts 30 seconds or until room expiry. Each member locks
one private choice; other members see only the number of submissions before
the deadline. After the deadline, at least two choices reveal together. Two
distinct choices produce winners under the usual rules; one or three distinct
choices draw. Fewer than two submissions produce no round.

Antakshari accepts a song title and a manually entered next sound. Members
judge whether a song fits the sound across languages. The first turn is open
to anyone; each later turn must come from a different member than the last.
Each turn creates an ordinary room message in the same transaction, so
existing message reporting and retention apply. Five minutes without a turn
ends the game. Room expiry ends access immediately.

Socket.IO sends a room-scoped `game:updated` hint after a committed change.
The client refetches the authorized REST snapshot on hints, reconnect, and
local deadlines, recovering from missed volatile events without exposing
hidden choices through the socket.

Any active room member may start one curated Pulse at a time. The question and
two options are resolved from a catalog ID, not client text. A Pulse lasts five
minutes at most and cannot outlive its room. Rooms may create at most ten Pulses.
Room-row locking serializes starts and votes. A membership may vote once; a retry
of the same choice returns the existing vote, while a different choice conflicts.
Counts are visible to voters and, after expiry, to everyone in the room. Vote
identities never appear in public responses. An independent public Pulse ID is
used in all URLs and socket hints; internal poll IDs stay in PostgreSQL.

Socket.IO sends only a room-scoped `pulse:updated` hint after a committed start
or vote. Each recipient is reauthorized under the existing room delivery checks.
The client fetches the latest REST snapshot after a hint or reconnect, so missed
volatile notifications do not lose state. Room expiration immediately denies
reads and votes; existing retention cleanup cascades Pulse votes and removes the
room's polls after the grace period.

Migration `20261108000000_pulse_public_ids` backfills random public IDs for
existing polls and adds the curated prompt ID. Apply it before deploying the
API and then the mobile app. The old poll rows are not displayed as curated
Pulses. Games store no audio or song lyrics.
