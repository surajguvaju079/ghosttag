# Opt-in room discovery

The host may list an ordinary GROUP room when creating it and may change that
choice while still an active owner of an accessible room. Existing rooms and matched rooms are unlisted.
Hiding a room removes it from new discovery results; it does not revoke existing
invite links or memberships. Discovery does not create a social graph.

Only an age-eligible anonymous identity with social access may browse. The listing
contains vibe, current member count, expiry, code and invite ID; it never exposes
room name, ghost names, participant IDs or internal identifiers. Results include
only active, unexpired, unlocked, non-full rooms the viewer has not joined and
whose active members are not blocked in either direction. Join always uses the
existing invite-bound transaction and rechecks age, blocks, capacity and expiry.
A previously fetched card can still be joined by invite after the host hides it.
The listing is ordered by creation time and invite ID, newest first, with a 20
room keyset page and an opaque cursor containing only those public values. Room
expiry remains the authoritative accessibility boundary.

`20261107000000_room_discovery` adds `discoverable BOOLEAN NOT NULL DEFAULT false`
and an index for listing. Deploy the migration before the backend and mobile
release. This feature adds no new media storage or permanent public identity.
