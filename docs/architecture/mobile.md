# Expo mobile MVP

The mobile app consumes the existing REST and Socket.IO contracts without changing
the backend, database schema or authorization model. It uses Expo Router, React
context for the anonymous session, and a room-local external store with
`useSyncExternalStore`. No global state-management dependency is needed. Existing
shared packages contain no implemented public contract types; mobile projections
live in `apps/mobile/src/api/contracts.ts` until a coordinated shared-contract
migration is approved.

## Responsibilities

- `api/`: public response projections, bearer requests, timeouts, URL/code validation,
  safe user-facing errors and rate-limit metadata.
- `auth/`: single-flight identity bootstrap, credential storage and session gating.
- `rooms/`: room access, membership/roster, leave/rejoin and room-local chat state.
- `messaging/`: Socket.IO adapter, public-ID deduplication and message validation.
- `ui/` and Expo Router screens: dark interface, safe areas, keyboard-aware chat,
  participant/report dialogs and lifecycle feedback.

## Identity and privacy

On first native launch, `POST /identity` creates one credential; SecureStore stores
only the returned token. Later launches read it and call `GET /identity/me` before
showing the app. The internal identity ID is ignored. Bootstrap is single-flight.
A storage or network failure blocks entry and offers retry; transient failures do
not clear an existing credential. Invalid, revoked or expired credentials gate the
whole app. The explicit **Start fresh** action deletes the old secure credential and
creates a new identity, with a warning that previous room memberships are lost.
The app never silently replaces an identity following a failed authenticated call.
Foregrounding also validates the ready session, including on home; transient
network failures preserve the stored credential and do not create another identity.
HTTP invalidation is bound to the credential used for the request, so a late 401
from a replaced credential cannot invalidate the new session.

Native storage uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; it does not request biometric
authentication. Keychain behavior across uninstall/reinstall is platform-dependent;
ordinary restarts retain the credential. The browser preview uses memory only and
requires a fresh identity after a page reload. No fallback plaintext credential
storage, message database, analytics, token logging or private-content logging is
introduced. Messages and drafts remain in memory and are cleared on room expiration,
room invalidation or session teardown. Backgrounding disconnects the socket; room
content remains in memory for foreground recovery until access is rechecked.

Navigation uses normalized public room codes, including the legacy create response:
its internal `id` is discarded. Public message IDs identify messages and cursors;
subscription participant IDs identify authors within the room. Names can collide;
a short public participant suffix helps distinguish message authors. The existing
roster has no participant ID, so the app preserves its server order and does not
try to correlate roster names with message authors or identities in another room.

## Room and messaging lifecycle

Before connecting, the app retrieves room details, ACTIVE membership, and roster.
REST and server-side socket authorization remain authoritative. The displayed
countdown uses `expiresAt`, never a fresh client-generated 24-hour duration. At the
known expiration, the app disables interaction, clears chat state and disconnects.
Locks and LEFT/missing membership invalidate access and clear content. Unlock
requires retry; LEFT membership has an explicit rejoin action. Expired/purged rooms
return to home rather than retrying indefinitely.

The socket uses `/rooms`, websocket transport, and `auth: {token}`. It never sends a
global user ID, membership UUID, client author or client timestamp. The app handles
structured acknowledgements and `connect_error.data`, `room:invalidated`, and
`session:invalidated`. Session invalidation is terminal even when caused by a server
verification failure. Subscribe/send authorization failures disable interaction;
Socket.IO room membership alone is never treated as proof of access.

Backgrounding and unmounting issue a best-effort unsubscribe and disconnect; server
disconnect cleanup is authoritative. Unsubscribe does not leave the persisted
membership. Only confirmed **Leave Room** calls REST leave, then clears local state
and navigates home. Back-to-home navigation keeps membership. Only focused room screens listen for app lifecycle events. Blur pauses the socket;
unmount disposes the controller. Foreground, network recovery, and reconnect all re-read room access, authenticate a new connection and
explicitly subscribe. Exponential reconnect delay is capped at 30 seconds and also
respects longer server `retryAfterMs` values. Room locks/inactive memberships require
an explicit retry/rejoin instead of a reconnect loop. REST/socket 429 deadlines are tracked separately for connection, sends and reports;
exhausting the daily report quota does not disable chat. The home screen also respects create/
join retry deadlines. The server enforces all limits independently.

History is newest first in an inverted list. Initial load fetches one page; older
pages are explicit. On reconnect, history is fetched from the head and follows
cursors until reaching the previous successful history head (or the end). Live
messages never advance this anchor: receiving one later push must not hide a gap
of earlier missed messages. Recovery from an initially empty room scans all new
pages. Outages spanning more than one page are recovered. Live events are buffered during recovery. Server
page order wins (PostgreSQL timestamps have more precision than JSON timestamps),
then public IDs deduplicate pages, pushes and send acknowledgements. Live-only
inserts use timestamp/public-ID order. Epoch checks discard responses from obsolete
connections, backgrounded screens and invalidated subscriptions. No durable push or
exactly-once fanout claim is made.

Each logical send gets one Crypto UUIDv4. A failed/uncertain acknowledgement leaves
an explicit retry item holding the exact original text and key. Retrying never uses
an edited draft or generates a replacement key. Retries are not automatically sent
following reconnection. Pending sends do not survive process termination; messages
that committed are recovered through history. The UI renders plain React Native
text and validates nonblank text, the 2,000 UTF-16-unit maximum, NULs and lone
surrogates. Server validation remains authoritative.

Reporting is a two-step reason selection and confirmation using only the current
room code, public message ID and documented reason. Success is local feedback;
reporter identities and report events are never displayed. The backend controls
moderation access and retention. No automated moderation or new reporting contract
is added.

## Deployment and verification boundaries

See `apps/mobile/README.md` for environment URLs, emulator/device networking, browser
CORS limitations, test commands and a device checklist. Environment variables are
public bundle configuration, not secret storage. Native release credentials must
travel over HTTPS/WSS. Existing backend live delivery supports one API process;
mobile integration does not add Redis or change that limitation. Core tests and
multi-platform bundle exports do not substitute for native device testing, mobile
accessibility review or a production security review.

## Native acceptance readiness

The reproducible [two-device runbook](../operations/native-acceptance.md) distinguishes
host-side HTTP/Socket.IO checks, automated regressions, and outstanding device
checks. `check:local` creates no identities or rooms: it verifies healthy PostgreSQL
through HTTP and expects a structured 401 from the unauthenticated `/rooms`
namespace. It does not prove phone routing, SecureStore persistence, or keyboard
behavior. Local-development configuration is separate from deployment; no API
contract, authorization rule or Prisma schema is changed.

## Google Play release preparation

`app.config.js` validates production API/socket URLs and published policy URLs before
Expo build/export. The production EAS profile pins EXPO_PUBLIC_APP_ENV=production;
mobile configuration repeats the endpoint checks at runtime. The concurrent developer tunnel override in the session provider is retained only outside production; production always reads the validated public environment variables. Local development
HTTP URLs remain supported outside that profile. Public HTTPS hostname syntax is
not proof of DNS/TLS reachability or ownership. Updates are embedded; no OTA update
channel/runtime contract was added. Release settings disable Android backups and
unneeded text-MVP permissions, with final merged-manifest verification pending.

Home links to Safety & privacy with accurate retention/reporting limitations and
owner-configured HTTPS policy links. This screen is informational, not legal
acceptance, blocking, deletion, or a staffed moderation service. Versioned consent,
room-scoped blocking, deletion/retention exceptions and age policy require the
human-owned contract/privacy decisions recorded in the
[release gates](../release/google-play/release-checklist.md). No server API/schema
changes were invented to resolve these decisions. Legal drafts are not published
policy. The existing 24-hour room lifecycle and public identity model remain intact.
