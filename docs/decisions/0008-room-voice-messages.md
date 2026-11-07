# 0008 — Room voice messages

Status: approved by the product owner for implementation. This
decision does not authorize deployment or public rollout.

## Decision

Native Android and iOS room members may hold the microphone beside the chat
input to record their original voice. Releasing stops recording and opens a
compact preview with Play, Discard, and explicit Send. The first hold warns that
the original voice may identify the speaker and requests microphone permission;
the user must hold again to record. No voice anonymization claim is made.
Recording is discarded when the room screen closes or the app backgrounds.
Browser preview remains text only and shows a fallback label for received clips.

The authenticated API accepts one MP4/AAC clip of at most 5 MiB per message.
There is no fixed recording time limit; the client stops near the size limit
and validates the final file. The client supplies its positive recording duration
in milliseconds, bounded by PostgreSQL's 32-bit integer range. The
server checks the container signature and size but does not decode or independently
prove playback duration; device tests and later media validation should cover this
limit. A dedicated two-per-minute identity and eight-per-minute network voice upload
limit supplements the shared message burst limit. Retries use a UUIDv4 and must
match the original bytes and duration.

PostgreSQL stores the clip in a `voice_clips` row tied to one message. The message
keeps `text: "Voice message"` as a safe fallback for older text clients, and adds
`voice: { durationMs }` to the existing public projection. Socket.IO broadcasts
metadata through the existing `message:created` event; it never transports audio
bytes. Upload and playback use REST. Playback requires the same current ACTIVE
room membership, credential and room lifecycle checks as history. No signed or
public media URL exists. Existing message reports can target a voice message.

Received clips and local previews show elapsed and total time with a seekable
progress bar. The existing room cleanup cascades from the message to its clip after the normal
retention grace. Room expiry immediately denies playback and uploads. Local
recordings use the app cache and are removed after send, discard or leaving the
screen. No permanent media archive or new infrastructure is introduced.

## Trade-offs and release checks

Keeping clips in PostgreSQL keeps deletion transactional and avoids a new
object store, while increasing database size and backup sensitivity. Operators
must account for this before rollout. Retention cleanup can lag if its worker is
down; the current one-hour grace is not a hard physical deletion deadline.

Release builds need microphone permission and a new native binary. Before release,
verify the merged Android manifest, iOS permission copy, recording/playback and
interruption handling on devices, payload limits, abuse reporting access, database
growth, and the updated Play data-safety declaration. Current social rollout gates
remain in force.
