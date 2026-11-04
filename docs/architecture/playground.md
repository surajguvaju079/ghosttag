# Temporary room playground

The next social milestone adds a reviewed English content catalog, a shared UTC
daily topic, editable conversation prompts, and two-choice Pulses in both group
and matched rooms. The catalog is server-owned and versioned with the API; there
is no per-person prompt history, streak, score, or permanent social graph.

The daily topic is chosen deterministically from the catalog by UTC day. Reading
it does not persist an event. A prompt is inserted into the local text composer
and becomes an ordinary reportable message only if the member sends it.

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
Pulses. No voice media is stored in this milestone.
