# Internal testing and release verification

## Automated/local evidence

Run from the repository root:

```sh
pnpm --filter @ghosttag/mobile typecheck
pnpm --filter @ghosttag/mobile lint
pnpm --filter @ghosttag/mobile test
pnpm --filter @ghosttag/mobile brand:check
pnpm --filter @ghosttag/mobile exec expo install --check
pnpm --filter @ghosttag/api test --runInBand
pnpm --filter @ghosttag/api test:e2e --runInBand
```

Integration suites create/migrate/drop isolated test databases and listen on local
HTTP/Socket.IO ports. First establish that the effective test/admin connection is
only the confirmed local development Compose service with CREATEDB permission.
Never point these commands at production/staging or a forwarded database.

Production endpoint tests reject missing configuration, HTTP, loopback, IPv4/IPv6,
emulator/LAN/WSL addresses, reserved names, credentials and unsafe socket origins.
They test the build-time gate, runtime validation and draft/internal artifact
configuration. Real DNS/TLS remains external acceptance, not mocked proof.

Production export must be run with the owner's actual public HTTPS endpoints and
EXPO_PUBLIC_APP_ENV=production. A syntactically valid synthetic endpoint may be
used only to validate bundling in an isolated local check; it proves no service is
running and is never a release candidate. A default production export with the
checked-in emulator .env example must fail. expo config and EAS local schema/profile
resolution are separate from an APK/AAB compilation.

## Native/backend acceptance gates

Use [the two-device plan](../../operations/native-acceptance.md) against a synthetic
production-like HTTPS backend and [branding plan](../../operations/native-branding.md).
Install the actual Play-generated APK from the internal track after upload approval;
check signatures, package, versionCode, target SDK and merged permissions. Verify
no debug menu/client, overlay, HTTP URL or API credentials in the release bundle.
Run Play pre-launch tests and 16KB-page-size compatibility validation.

Exercise create/join/rejoin/leave, both-way chat, ordering/history/retries/reporting,
network/background/restart recovery, SecureStore, expiry, locks and revocation.
Confirm HTTPS REST and WSS namespace authentication from two external devices.

Before rollout, ADD and pass negative/concurrent tests for server-enforced terms
acceptance, blocking across history/live/reconnect/leave/rejoin, deletion races with
sends, creator deletion, other-user data preservation, credential invalidation,
legal-retention exceptions and cross-room public-ID isolation. These features and
their tests do not exist yet. Verify policy links and child-safety feedback/contact
in the installed build, including before UGC and without an existing named account.

Record device/OS/build/backend version, tester/date, results/screenshots and known
issues; do not mark native checks passed based on JS exports or browser mocks.
