# 0008 — Short room voice messages

Status: approved by the product owner for implementation. This
decision does not authorize deployment or public rollout.

## Decision

Native Android and iOS room members may record up to ten seconds of their
original voice, preview it, discard it, or explicitly send it. The composer
warns that the original voice may identify the speaker before recording. No
voice anonymization claim is made. Recording requires an explicit tap and stops
when the room screen closes or the app backgrounds. Browser preview remains text
only and shows a fallback label for received clips.

The authenticated API accepts one MP4/AAC clip of at most 256 KiB per message.
The client supplies its recording duration, constrained to 1–10,000 ms. The
server checks the container signature and size but does not decode or independently
prove playback duration; device tests and later media validation should cover this
limit. A dedicated six-per-minute identity and 24-per-minute network voice upload
limit supplements the shared message burst limit. Retries use a UUIDv4 and must
match the original bytes and duration.

PostgreSQL stores the clip in a `voice_clips` row tied to one message. The message
keeps `text: "Voice message"` as a safe fallback for older text clients, and adds
`voice: { durationMs }` to the existing public projection. Socket.IO broadcasts
metadata through the existing `message:created` event; it never transports audio
bytes. Upload and playback use REST. Playback requires the same current ACTIVE
room membership, credential and room lifecycle checks as history. No signed or
public media URL exists. Existing message reports can target a voice message.

The existing room cleanup cascades from the message to its clip after the normal
retention grace. Room expiry immediately denies playback and uploads. Local
recordings use the app cache and are removed after send, discard or leaving the
screen. No permanent media archive or new infrastructure is introduced.

## Trade-offs and release checks

Keeping short clips in PostgreSQL keeps deletion transactional and avoids a new
object store, while increasing database size and backup sensitivity. Operators
must account for this before rollout. Retention cleanup can lag if its worker is
down; the current one-hour grace is not a hard physical deletion deadline.

Release builds need microphone permission and a new native binary. Before release,
verify the merged Android manifest, iOS permission copy, recording/playback and
interruption handling on devices, payload limits, abuse reporting access, database
growth, and the updated Play data-safety declaration. Current social rollout gates
remain in force.
