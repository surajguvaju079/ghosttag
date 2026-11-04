# Playground API

All endpoints require an eligible anonymous bearer credential and enabled social
access. Room Pulse endpoints additionally require an active membership and an
accessible room. Responses use `Cache-Control: no-store` where read state is
returned; clients should not store room content after room expiry.

- `GET /api/v1/playground/today` returns `{date, topic, prompts, pulses}`.
  `date` is UTC `YYYY-MM-DD`; each Pulse choice has `id`, `question`, `optionA`,
  and `optionB`.
- `GET /api/v1/rooms/:code/pulses` returns `{pulses}` (newest first, at most ten).
- `POST /api/v1/rooms/:code/pulses` accepts `{promptId}` from the catalog and
  returns the Pulse. One active Pulse is allowed; retrying the same prompt while
  active returns the same Pulse. A different prompt returns `409 PULSE_ACTIVE`.
- `POST /api/v1/rooms/:code/pulses/:pulseId/vote` accepts `{option:"A"|"B"}`
  and returns the updated Pulse. The same vote is idempotent; changing it returns
  `409 PULSE_ALREADY_VOTED`. An expired Pulse returns `410 PULSE_EXPIRED`.

A Pulse contains `code`, public `pulseId`, question and options, timestamps,
`myVote`, and `results`. Results are null for a nonvoter until expiry, then show
`{A,B}` totals. No voter identities or internal IDs are returned. A room may
start at most ten Pulses (`409 PULSE_LIMIT`). Starts and votes use the
`PULSE_ACTION` rate policy. The `/rooms` Socket.IO namespace emits
`pulse:updated` with `{code,pulseId}` after committed changes; clients must
refetch because the event is best effort.
