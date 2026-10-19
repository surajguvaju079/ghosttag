# GhostTag mobile

Expo SDK 57 / React Native / Expo Router mobile MVP for the existing NestJS API.
Read `docs/architecture/mobile.md` for state, privacy, and recovery decisions.

## Native acceptance

Start with [the local setup and two-device acceptance runbook](../../docs/operations/native-acceptance.md).
It includes explicit commands, network checks, operator fixtures, expected results,
and a results table. Native device checks remain pending until executed on devices.
The checked-in API example and this environment use port **8080**; the backend's
fallback when `PORT` is absent is 3000. Always match the API's actual port.

## Development

Use the repository's pnpm version (`pnpm install` at the root). Start the local
PostgreSQL/API stack using the root backend instructions, then:

```sh
# Only if apps/mobile/.env does not already exist:
cp apps/mobile/.env.example apps/mobile/.env
# Edit EXPO_PUBLIC_API_URL for your device before starting Expo.
pnpm --filter @ghosttag/mobile start
```

`EXPO_PUBLIC_API_URL` is the full API base, including `/api/v1`.
`EXPO_PUBLIC_SOCKET_URL` is optional and defaults to that URL's origin; provide
only an origin, without `/api/v1`, `/rooms`, a query, or credentials. Socket.IO uses
its existing `/rooms` namespace and `/socket.io` transport path. Public Expo
variables are bundled into the app: never put secrets or tokens in them. Restart
Expo (use `start --clear` if needed) after changing configuration.

| Target                              | Example API URL                                                       |
| ----------------------------------- | --------------------------------------------------------------------- |
| Android emulator                    | `http://10.0.2.2:8080/api/v1`                                         |
| iOS simulator on the API machine    | `http://127.0.0.1:8080/api/v1`                                        |
| Physical device on the same network | `http://192.168.1.20:8080/api/v1` (use your computer's actual LAN IP) |
| Deployment                          | `https://api.example.com/api/v1`                                      |

The NestJS API must be reachable on the computer's LAN interface and its port must
be allowed through the local firewall. An Expo tunnel exposes Metro, not your API.
Use HTTPS/WSS for deployment; local HTTP is for trusted development networks.
Standalone native builds may require platform-specific development network policy
configuration for local HTTP. SecureStore and Crypto are Expo SDK modules and are
included in the Expo Go workflow; native development builds must include them.

The web target is a **browser preview**, with an in-memory identity that resets on
page reload. It intentionally does not put credentials into localStorage. Native
credentials use SecureStore and survive ordinary app restarts. The existing API
does not enable browser CORS: web preview needs a same-origin reverse proxy for
`/api/v1` and `/socket.io`, or an explicitly approved backend CORS configuration.
Native requests are not subject to browser CORS. Production web authentication
and persistence need a separate product/security decision. The web output is an
SPA so room-code routes can load directly; hosting must fall back to `index.html`.

## Verification

```sh
pnpm --filter @ghosttag/mobile typecheck
pnpm --filter @ghosttag/mobile test
pnpm --filter @ghosttag/mobile lint
# Targeted lint for the MVP:
pnpm --filter @ghosttag/mobile exec eslint src/api src/auth src/messaging src/rooms src/ui src/app/index.tsx src/app/_layout.tsx 'src/app/room/[code].tsx' test eslint.config.js
pnpm --filter @ghosttag/mobile build
```

`build` exports production JavaScript/assets for iOS, Android, and web; it does not
compile native binaries or verify devices. Provide the desired public environment
at build time. Core tests use injected secure-storage, HTTP, and socket adapters;
they cover session persistence/invalidation, public-code create/join, lifecycle
errors, pagination/recovery, deduplication, stable retry keys, and reports.

## Manual device checklist

Use two clients with independent credentials against a confirmed local backend.
Create and join a room, compare the roster, send messages in both directions,
background one client, send over 50 messages, foreground and inspect recovered
history. Load older pages, retry a send after interrupting its acknowledgement,
report a message, leave/rejoin, and verify that the ghost name is preserved.
Test locking, expiration and credential revocation using the backend's integration
fixtures or an operator-controlled local database. Verify keyboard/safe-area
behavior, Android back navigation, iOS navigation, slow/offline networks, and
SecureStore persistence after a force quit. Never use production data for fixtures.

No native-device verification is implied by exports or core tests. Polls, reactions,
Echo, Ghost Swap, push notifications and background message delivery are outside
this MVP. The branding tagline mentions voting; voting is not implemented yet.

## Optional browser contract smoke test

`test/browser-smoke.txt` is a Playwright CLI workflow with mocked REST and Socket.IO
responses, including an Engine.IO handshake. It verifies the rendered create,
send/deduplication, report, roster, leave and lowercase-code rejoin flows, one
identity per page, public-code navigation, and absence of internal IDs in the UI.
It does not exercise a real backend or native secure storage. With Playwright CLI
and its browser installed, run from the repository root:

```sh
EXPO_PUBLIC_API_URL=http://127.0.0.1:8080/api/v1 pnpm --filter @ghosttag/mobile exec expo export --platform web --output-dir /tmp/ghosttag-mobile-web
python3 -m http.server 18081 --bind 127.0.0.1 --directory /tmp/ghosttag-mobile-web
# In another terminal:
playwright cli -s=ghosttag-mobile open about:blank
playwright cli -s=ghosttag-mobile run-code --filename=apps/mobile/test/browser-smoke.txt
```

Use your Playwright browser configuration if Chrome is not the installed browser.
The fixture uses synthetic credentials, mocks bundled API requests inside the isolated test browser session,
and writes screenshots to `/tmp/ghosttag-home.png` and `/tmp/ghosttag-room.png`.

## Brand assets

For native APK development/preview commands, identifier prerequisites, themed-icon
checks and standalone splash acceptance, see
[native branding verification](../../docs/operations/native-branding.md).

The mobile home and startup screens use the approved reference at
`docs/design/ghosttag-brand-reference.png`. Brand artwork, export dimensions,
generation prompts, and rebuild instructions live in
[assets/brand/README.md](assets/brand/README.md).

```sh
pnpm --filter @ghosttag/mobile brand:export
pnpm --filter @ghosttag/mobile brand:check
```

Native app icons and the system splash require rebuilding/reinstalling the app;
Expo Go uses its own launcher icon/splash. The JavaScript home/loading branding
appears in Expo Go. Native splash placement remains controlled by each OS,
including Android 12+ splash constraints. Native device visual verification remains
pending. The four supported room vibes and all API/messaging behavior are retained.
