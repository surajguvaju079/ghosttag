# Google Play first release — release gate

Status: **NOT READY for tester rollout or publication**. Audit date: 2026-10-19.
Internal testing is the first proposed track, not permission to bypass safety work.
No build, upload, account access, signing change, or deployment was performed.

## Configuration

- GhostTag / ghosttag / com.ghosttag (Android and iOS), owner surajguvaju.
- Preserve the user's existing project ID ec4f917f-6671-4b01-be4e-0b0271542e91.
  This is locally configured linkage, not remote ownership verification.
- production: store AAB, no development client, production environment.
- development/preview: internal APKs. Development requires Metro; preview does not.
- android.versionCode starts at 1, app version 1.0.0; EAS version source is local.
  **Before every subsequent uploaded AAB, increment versionCode in app.json above
  every value already used in Play Console.** A failed/draft upload can consume a
  version code. No remote version counter or auto-increment mutation is enabled.
- Production config requires valid published HTTPS privacy/terms/community URLs; these must be owner-provided and reviewed. Production config and runtime reject HTTP, IP literals (including emulator/WSL/
  private IPv4 and IPv6), local/reserved DNS names, non-443 ports and URL credentials.
  API must end in /api/v1; optional socket URL is an HTTPS origin, yielding WSS.
  Public-looking DNS can still resolve privately: independently check DNS, TLS,
  ownership and reachability from external networks. No production domain is known.
- Production blocks overlay and text-MVP-unneeded microphone, camera, media/storage,
  location, contacts, notifications, vibration and advertising-ID permissions.
  Backup is disabled. Inspect the final merged release manifest/native artifact;
  Expo config introspection alone does not inspect every transitive library.
- SDK 57 defaults to target/compile SDK 36; verify actual AAB target SDK, 16KB page
  support and Play validation. Current target requirements are documented by
  [Android](https://developer.android.com/google/play/requirements/target-sdk).
- No expo-updates dependency, update channel or runtimeVersion is configured.
  Do not publish OTA updates; this release uses embedded JavaScript. Adding OTA
  distribution requires a separate rollout/runtime compatibility decision.
- No checked-in CI/CD deployment automation was found. No automatic submission added.

## Policy readiness matrix

| Area               | Implemented evidence                                                                    | Missing / release gate                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| UGC reporting      | Authenticated public-message reports, fixed reasons, deduplication, quotas              | Direct participant reports and staffed response/escalation                                                     |
| Blocking           | None                                                                                    | Approve scope; persistent server filtering and delivery checks; UI and concurrency tests                       |
| Terms acceptance   | None                                                                                    | Approved published terms/guidelines; versioned acceptance before any UGC, server enforcement and tests         |
| Identity deletion  | Credential revocation is checked on REST/sockets; Start fresh only replaces local token | Authenticated deletion, associated data semantics, web request path, receipts/retries and tests                |
| Privacy            | SecureStore, hashed server credentials, room-scoped public IDs, private reports         | Owner/processor inventory, public policy, retention/backup decisions, Data safety signoff                      |
| Child safety       | Existing message report categories can flag objectionable text                          | Named contact, published CSAE standards, escalation/reporting process, approved age policy and in-app feedback |
| Moderation         | Private report rows, operator-controlled revocation/locks/deletion possible             | Assigned reviewer, review frequency, response times, action audit, client-cache limitations                    |
| Audience/rating    | No age gate                                                                             | Owner audience/country decision, suitable screening, truthful IARC answers                                     |
| Production backend | Health/readiness query, rate limits, expiry/cleanup, sanitized app logs                 | Public TLS/WSS deployment, edge protections, secrets validation, backup restore drill, monitoring              |
| Native quality     | JS tests/exports and pixel checks                                                       | Installed AAB-derived APK, pre-launch report, physical two-device tests and accessibility                      |

The [UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937)
requires acceptance before UGC, effective moderation, reporting and blocking. Drafts
and local UI alone do not satisfy these controls. Resolve all gates above before
inviting testers into a production-connected social service.

## Owner decisions and signoff

- Confirm target audience/minimum age and distribution countries; 18+ is only a
  proposal, not an implemented age policy or a substitute for child-safety duties.
- Approve room-scoped blocking through leave/rejoin, public participant targeting,
  persistence/API contract and semantics for past history/live delivery.
- Approve deletion behavior for room creators without deleting others' conversations;
  creatorId is currently required. Decide treatment of messages, memberships, reports,
  credentials, backups and legally necessary evidence with an explicit retention time.
- Supply legal/operator identity, support and child-safety contacts, HTTPS API/policy/
  deletion-request URLs, processors, countries and backup/log retention.
- Review all drafts in this directory with appropriate legal/policy advice; assign
  an accountable moderator and escalation coverage before rollout.
- Approve Play App Signing/upload-key setup and each build/upload/review/rollout action.
- See [submission](submission.md), [backend](production-backend-checklist.md),
  [test plan](testing-plan.md), and [verification](verification.md).

## Files requiring owner review before publication

Review every draft and declaration together: [store listing](store-listing.md),
[privacy policy](privacy-policy-draft.md), [terms](terms-of-service-draft.md),
[community guidelines](community-guidelines-draft.md),
[Data safety inventory](data-safety-inventory.md), [child safety](child-safety-readiness.md),
[content rating](content-rating-guidance.md), [testing plan](testing-plan.md),
[release notes](release-notes.md), [moderation process](moderation-workflow.md),
[production deployment checklist](production-backend-checklist.md) and
[submission workflow](submission.md). Inspect app.json/app.config.js/eas.json and the
actual native artifact/merged manifest as part of final release signoff. Public
legal URLs, age policy and contact information must match the implemented product.
