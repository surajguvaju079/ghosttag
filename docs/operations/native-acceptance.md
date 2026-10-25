# Native acceptance: two devices, local backend

Status: **ready for operator/device execution; device checks have not been run**.
Use two independent native installations/Expo Go clients, A and B. A browser tab
is not a native device and its in-memory identity does not test SecureStore.
Use synthetic conversations and a confirmed local development database only.

## Start the development services

Run all commands from the repository root. Use the pinned pnpm version from
`package.json` and Node supported by the installed Expo SDK (see the SDK 57 docs).

```sh
pnpm install
# Create these files only if absent; keep existing local configuration.
# cp apps/api/.env.example apps/api/.env
# cp apps/mobile/.env.example apps/mobile/.env

docker compose up -d postgres
docker compose ps
docker compose exec -T postgres pg_isready -U ghosttag -d ghosttag
pnpm --filter @ghosttag/api exec prisma migrate status
```

Before applying migrations, inspect `apps/api/.env` privately. Confirm
`NODE_ENV=development` and a URL for this local Compose database
(`localhost:5432/ghosttag` with the Compose development account). Check for a
shell `DATABASE_URL` override, which takes precedence over the file. Never print
or paste a complete database URL containing credentials. If the target is not
confidently local, stop; do not run migration or fixture commands. For a confirmed
local database with pending committed migrations:

```sh
pnpm --filter @ghosttag/api exec prisma migrate deploy
pnpm --filter @ghosttag/api exec prisma migrate status
pnpm --filter @ghosttag/api prisma:generate
# Separate terminal; explicit port overrides an older local .env port:
PORT=8080 pnpm dev:api
```

The checked-in example uses 8080; backend fallback without `PORT` is 3000. Do not
confuse the API port with Metro (normally 8081). API startup runs the existing
retention worker; use synthetic local data. Keep PostgreSQL's port private to the
computer: devices need the API and Metro, not database access. Do not reset Docker
volumes or delete migrations to fix setup.

```sh
curl --fail http://127.0.0.1:8080/api/v1/health
pnpm --filter @ghosttag/mobile check:local http://127.0.0.1:8080/api/v1
# Substitute a host address reachable by your devices:
pnpm --filter @ghosttag/mobile check:local http://192.168.1.20:8080/api/v1
```

The probe checks HTTP/database health and a structured authentication rejection
from the actual `/rooms` Socket.IO namespace. It sends no credential and creates
no identity, membership or message. It fails on an unavailable database, wrong
port/path/namespace, timeout, or an unauthenticated accepted connection. Running
it on the computer verifies the host path only. Open the same health URL in **each
device's browser** and confirm `status: ok` and `services.database: ok` before
starting the app. Then test actual authenticated messaging in the checklist.

## Expo and device commands

In `apps/mobile/.env`, set just `EXPO_PUBLIC_API_URL` to the appropriate full URL.
Leave `EXPO_PUBLIC_SOCKET_URL` unset unless a separate origin is necessary; it is
derived from the API origin. An old socket override pointing to another port or
host breaks chat even if HTTP works. Never put credentials in Expo public variables.
Changing an API URL requires restarting Metro; changing the computer IP requires
updating configuration on both clients.

| Target                                 | API URL                                        | Command in a separate terminal                                                                                                        |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Android emulator on the API host       | `http://10.0.2.2:8080/api/v1`                  | `EXPO_PUBLIC_API_URL=http://10.0.2.2:8080/api/v1 pnpm --filter @ghosttag/mobile android --go --lan`                                   |
| Physical Android, same trusted network | `http://192.168.1.20:8080/api/v1` (replace IP) | `EXPO_PUBLIC_API_URL=http://192.168.1.20:8080/api/v1 pnpm --filter @ghosttag/mobile start --go --lan --clear` then scan QR in Expo Go |
| iOS simulator on macOS                 | `http://127.0.0.1:8080/api/v1`                 | `EXPO_PUBLIC_API_URL=http://127.0.0.1:8080/api/v1 pnpm --filter @ghosttag/mobile ios --go --lan`                                      |
| Physical iPhone                        | host LAN API URL                               | Start Expo as for physical Android and open the QR using an SDK 57-compatible Expo Go client                                          |

Use an Expo Go version supporting SDK 57. Rebuild an existing development client
after SDK/native package updates; a Metro reload does not update its native binary.
The standard `android`/`ios` scripts launch Expo Go, not a signed standalone binary.
Android emulator startup needs Android Studio/SDK, `adb`, an AVD and hardware
virtualization. iOS Simulator needs macOS and Xcode; it is unavailable on Linux.

For USB-connected physical Android with `adb`, an alternative to Wi-Fi routing is:

```sh
adb devices
# Select your serial if more than one Android target is attached:
adb -s YOUR_SERIAL reverse tcp:8080 tcp:8080
adb -s YOUR_SERIAL reverse tcp:8081 tcp:8081
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080/api/v1 pnpm --filter @ghosttag/mobile start --go --localhost
# Open the printed exp://127.0.0.1:8081 URL in Expo Go on that device.
```

Repeat `adb reverse` per target, and point at the machine actually hosting the API.
For a custom native debug build, use `pnpm --filter @ghosttag/mobile exec expo
run:android --device` (or `run:ios --device` on macOS) after configuring the platform
SDK and the app identifiers. This generates native projects and requires a full
native toolchain; this milestone only verifies JavaScript/assets exports. Use
HTTPS/WSS for standalone/release testing, or explicitly configure a development-only
HTTP policy and verify it in the installed binary. Do not weaken release transport
security globally to make a local HTTP test pass. The iOS configuration includes a
local-network permission description; allow that permission when prompted.

### LAN and firewall troubleshooting

- Nest's existing `listen(port)` accepts host interfaces; verify with
  `ss -ltn` on Linux or the platform equivalent. A reverse proxy must forward
  `/api/v1` and `/socket.io` WebSocket upgrades on the same configured origin.
- Allow inbound API TCP 8080 and Metro's printed port (normally TCP 8081) only on
  the trusted development network. Keep PostgreSQL 5432 inaccessible to phones.
  Do not disable the whole firewall. No firewall rules are changed by this task.
- Phones and computer must have a route to one another. Guest Wi-Fi/client
  isolation, corporate VPNs, cellular fallback and security software can block it.
  A Docker bridge address is not normally a usable phone address.
- On WSL2/VM hosts, a successful request to a virtual interface such as `172.30.x.x`
  from the host does not prove Wi-Fi phone access. Use a reachable host LAN address,
  mirrored networking or explicit host port forwarding for **both** API and Metro.
  Expo may advertise the VM's unreachable address; configure its advertised hostname
  for your network (`REACT_NATIVE_PACKAGER_HOSTNAME`) where needed. Check the QR URL.
- An Expo tunnel exposes Metro, not this API. If using a separately approved API
  tunnel, use its HTTPS origin for HTTP and WebSocket connections and treat room
  contents/credentials as sensitive. Browser CORS is separate from native routing.
- If HTTP works but chat fails, check the socket origin override, port, namespace,
  WebSocket upgrade support, proxy timeout and structured connection error. Do not
  paste auth headers, socket auth objects or SecureStore values into diagnostics.

## Two-device checklist

Record app/Expo versions, OS/device models, network topology, public room code,
UTC run time, and a pass/fail result per row. Do not record credentials, internal
identity IDs or private conversations. Use a fresh room after terminal revocation
or expiration tests. Do not infer a native pass from the automated result column.

| #   | Action                                                                                                    | Expected result                                                                                                                                                          | Automation/evidence                                                                       |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | Fresh native client on A and B; launch once and reload without clearing app data                          | One stored credential per client; no credential/internal ID in UI or logs                                                                                                | Bootstrap single-flight and credential-store tests; native storage pending                |
| 2   | Force-stop/quit each app and launch again, without uninstalling, clearing data or selecting Start fresh   | Same anonymous identity; join the same room and verify the original ghost name/avatar and owner/member role                                                              | Session restoration tests; real SecureStore force-quit check pending                      |
| 3   | A selects a vibe/name and creates a room                                                                  | Public code shown; A is owner; countdown uses server expiration                                                                                                          | API adapter and backend create tests                                                      |
| 4   | B enters A's code in lowercase with surrounding whitespace                                                | Same room, B has a distinct room identity; participant sheet shows 2 after refresh                                                                                       | Code normalization and backend join tests                                                 |
| 5   | Send synthetic numbered messages A→B and B→A                                                              | Both clients receive each committed message; own messages styled correctly                                                                                               | Backend Socket.IO/persistence tests; two-device fanout pending                            |
| 6   | Alternate sends and use Load older messages; retry one uncertain send without editing its retry item      | Correct newest/older order, each public message once; retry uses original text/key                                                                                       | History, ordering, cursor and deduplication tests                                         |
| 7   | Disable B's network; A sends numbered messages; restore B's network                                       | Offline state disables sends; automatic backoff/reconnect, fresh subscription and complete history with no duplicates                                                    | Multi-page/anchor recovery tests; test over 50 missed messages at normal send limits      |
| 8   | Background B or lock its screen; A sends; foreground B                                                    | Hidden/background screen disconnects; focused foreground screen revalidates and recovers; no automatic resend of uncertain items                                         | Pause, stale-event, retry and credential revalidation tests                               |
| 9   | B leaves; A refreshes participants; B rejoins. Also leave/rejoin A as owner                               | LEFT users lose access; active count updates on roster refresh; original ghost identity/role returns; room survives owner departure                                      | Existing leave/rejoin and owner backend tests                                             |
| 10  | Revoke A's credential using the local fixture below; also test revocation while A is backgrounded/on home | Session gates on socket invalidation or foreground validation; explicit Start fresh creates a new identity and warns memberships are lost                                | Session invalidation and backend revocation tests; never restore/reuse revoked credential |
| 11  | In a fresh baseline room, apply a temporary lock while both are subscribed; unlock and retry              | Both stop receiving/sending and cached chat clears; new joins denied; manual retry/foreground revalidation recovers only after unlock                                    | Backend lock/sweep tests and mobile invalidation tests                                    |
| 12  | Set baseline room expiration to now, including while B is backgrounded                                    | Composer disabled, history cleared, subscriptions removed; foreground must not briefly authorize sends; no rejoin to expired room                                        | Local timestamp gate and backend expiration tests                                         |
| 13  | In a fresh room, select Report, reason, Cancel; then confirm a report and repeat it                       | Cancel makes no request; confirm shows success; no reporter identity shared; cooldown shows a countdown; report quota does not block chat                                | Report, cooldown/reset and backend isolation tests                                        |
| 14  | Interrupt a send around acknowledgement, then force-stop/restart the app                                  | Saved identity survives. Pending draft/key is memory-only and is not automatically resent. A committed message appears once through history; an uncommitted send is lost | Simulated process-restart test; native timing test pending                                |

During rows 5–8, test Android gesture navigation and 3-button navigation, iOS safe
areas, portrait screens, large font sizes, and a multiline 2,000-unit composer. Open
and close the keyboard repeatedly: composer/Send must stay visible above it, list
must remain scrollable, and the bottom safe area must not obscure controls. Android
config uses `adjustResize`; iOS uses keyboard padding. Back first dismisses the
keyboard when the OS handles it; room back/home navigation must unsubscribe without
leaving membership. An explicit Leave action must confirm and update membership.
Returning to a hidden room must revalidate instead of keeping its socket active.

For row 7, use sequential messages and respect server send quotas; sending 50+
messages requires more than one rate-limit window. Count the synthetic sequence on
both clients after recovery. For row 13, the default identity quota is 10 report attempts per day, including
repeats for the same synthetic message. An 11th confirmation exercises 429 without
creating duplicate reports; check the current configured policy first. Automated
tests cover daily quota/reset;
do not lower deployment safety limits to accelerate a device test. Use a dedicated,
restarted local API with documented local overrides if exercising UI quota feedback.
The backend rate policies are in `docs/operations/messaging-safety.md`.

## Local lifecycle fixtures

These commands target only the repository's **confirmed local Compose postgres**
service and return public codes/timestamps or row counts. Replace `GH-1234` with the
synthetic test room. Run the SQL interactively after the command; do not paste
credentials or private content. Never point these examples at staging/production.

```sh
docker compose exec postgres psql -U ghosttag -d ghosttag -v code=GH-1234
```

```sql
-- Lock for two minutes, then test both clients immediately.
UPDATE rooms SET "lockedUntil" = NOW() + INTERVAL '2 minutes'
WHERE code = :'code' RETURNING code, "lockedUntil";

-- Unlock the same test room. Clients must explicitly retry/resubscribe.
UPDATE rooms SET "lockedUntil" = NULL
WHERE code = :'code' RETURNING code;

-- Expire; this is terminal for this test room. Create another room afterward.
UPDATE rooms SET "expiresAt" = NOW()
WHERE code = :'code' RETURNING code, "expiresAt";

-- Revoke device A, the creator of this test room. This affects all of A's rooms.
UPDATE identity_credentials SET "revokedAt" = NOW()
WHERE "userId" = (SELECT "creatorId" FROM rooms WHERE code = :'code')
RETURNING "revokedAt";
```

Perform each fixture separately against the intended fresh baseline, not all four
blindly as one script. Never unrevoke a credential to resume a test; select Start
fresh in the UI. Expiration denies access immediately even before physical cleanup.

## Automated verification and results

```sh
pnpm --filter @ghosttag/mobile typecheck
pnpm --filter @ghosttag/mobile lint
pnpm --filter @ghosttag/mobile test
pnpm --filter @ghosttag/mobile exec expo install --check
pnpm --filter @ghosttag/mobile exec expo config --type introspect
pnpm --filter @ghosttag/api test --runInBand
# Creates/drops isolated ghosttag_test databases on confirmed local PostgreSQL:
pnpm --filter @ghosttag/api test:e2e --runInBand
EXPO_PUBLIC_API_URL=http://192.168.1.20:8080/api/v1 pnpm --filter @ghosttag/mobile build
```

Exports validate JavaScript/assets for Android, iOS and web; they do not compile
native binaries, install an app, prove emulator/device connectivity or validate
platform keyboard/Keychain behavior. SDK 57 patch packages and Metro runtime peers
must match; restart existing Metro processes and rebuild custom development clients
following dependency changes.

Copy and complete this record per actual device run (leave blank until executed):

| Field                                           | A       | B       |
| ----------------------------------------------- | ------- | ------- |
| Device / OS / Expo client version               | Not run | Not run |
| Network / reachable health URL                  | Not run | Not run |
| App revision / public test room code / UTC time | Not run | Not run |
| Checklist rows 1–14 (pass/fail per row)         | Not run | Not run |
| Keyboard / safe area / native back results      | Not run | Not run |
| Failures, reproduction and sanitized evidence   | Not run | Not run |

The next milestone is executing this runbook on two native clients, resolving
observed platform issues, then validating a signed development/release build with
HTTPS and the intended deployment configuration. No device sign-off is implied by
this readiness work.

### Repository verification record — 2026-10-18

| Check                              | Observed result                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Local Compose PostgreSQL 17        | Running and healthy; confirmed `localhost:5432/ghosttag`, development configuration                            |
| Prisma migration status            | All 5 committed migrations applied; no new schema/migration needed                                             |
| Local API                          | Started on configured port 8080; healthy database response                                                     |
| Host HTTP + `/rooms` probes        | Passed on loopback and `172.30.213.142`; missing socket credentials correctly rejected                         |
| Negative connectivity probe        | Unreachable local API correctly produces failure                                                               |
| Expo SDK 57 dependency check       | Passed after recommended patch updates; pnpm reports no peer issues                                            |
| Expo native config introspection   | Passed; Android `adjustResize` and iOS local-network description present                                       |
| Metro LAN startup                  | Passed on temporary port 18082; Android manifest advertises host interface and SDK 57                          |
| Mobile checks                      | TypeScript, full lint and targeted lint passed; 40 automated tests passed                                      |
| Backend regressions                | 108 unit tests and 107 PostgreSQL/Socket.IO integration tests passed                                           |
| Export / browser                   | Android, iOS and web JavaScript/assets exported; mocked browser workflow passed                                |
| Native device / simulator / binary | Not run; Linux host has no usable `adb`/Android emulator on PATH or configured SDK, and no Xcode/iOS Simulator |

The interface address above is an observation, not a reusable phone configuration.
Host-only success does not verify routing through Wi-Fi, WSL/VM NAT or a firewall.
Existing Metro instances must be restarted after dependency updates. This record
is a snapshot; rerun checks after changing configuration or dependencies. Temporary
verification services are stopped after validation; use the commands above to
start your acceptance session. No staging or production environment was modified.
