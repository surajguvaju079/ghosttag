# Playground API

All endpoints require an eligible anonymous bearer credential and enabled social
access. Room Pulse endpoints additionally require an active membership and an
accessible room. Responses use `Cache-Control: no-store` where read state is
returned; clients should not store room content after room expiry.

- `GET /api/v1/playground/today` returns `{date, topic, story, prompts, pulses}`.
  `date` is UTC `YYYY-MM-DD`; `story` is a shared daily story setup. Three
  prompts and three Pulse choices rotate by UTC day. Each Pulse choice has `id`,
  `question`, `optionA`, and `optionB`.
- `GET /api/v1/rooms/:code/pulses` returns `{pulses}` (newest first, at most ten).
- `POST /api/v1/rooms/:code/pulses` accepts `{promptId}` from the catalog and
  returns the Pulse. One active Pulse is allowed; retrying the same prompt while
  active returns the same Pulse. A different prompt returns `409 PULSE_ACTIVE`.
  IDs from previous daily selections remain accepted for older clients.
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

## Room games

All game routes require an eligible identity, social access, a live room, and
active membership. Read responses use `Cache-Control: no-store`. The
`GAME_ACTION` rate policy applies to mutations.

- `GET /api/v1/rooms/:code/game` returns `{game}` with the most recent game or
  `null`. State is viewer-specific.
- `POST /api/v1/rooms/:code/game` accepts `{kind:"RPS"|"ANTAKSHARI",clientGameId}`
  with a UUID client ID. Retrying a start key returns that game. Starting while
  another game is active returns `409 GAME_ACTIVE`.
- `POST /api/v1/rooms/:code/game/:gameId/choice` accepts
  `{choice:"ROCK"|"PAPER"|"SCISSORS"}`. Repeating a choice succeeds; changing
  it returns `409 GAME_CHOICE_LOCKED`.
- `POST /api/v1/rooms/:code/game/:gameId/turn` accepts UUID `clientTurnId`,
  `title` (1–120 characters), and `nextCue` (1–12 characters). It returns
  `{game,message}`. Retrying the key and content returns the same message.
  Consecutive turns from one member return `409 WAIT_FOR_ANOTHER_PLAYER`.
- `POST /api/v1/rooms/:code/game/:gameId/end` ends a game for its starter or
  room owner; others receive `403 GAME_END_FORBIDDEN`.

Game state includes public `gameId`, `kind`, `status`, timestamps, and a
room-scoped starter ghost. RPS returns the viewer's `myChoice` and submission
count during play; after reveal it returns ghost choices, winner participant
IDs, and `WIN`, `DRAW`, or `NO_ROUND`. Antakshari returns the next cue and
latest 20 turns. Internal IDs are omitted. The `/rooms` Socket.IO namespace
emits volatile `game:updated` hints containing `{code,gameId}`. Clients
refetch authorized state after a hint or reconnect.
