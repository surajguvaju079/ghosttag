# Data safety inventory — draft, not a completed Play declaration

Collection includes transmission off-device, even when users have no named account.
Use this source inventory to complete Play Console only after production/SDK review.
Room TTL alone is not a basis to declare all processing ephemeral or no data collected.

| Data                                                          | Actual code behavior                                              | Purpose / recipients / open question                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Anonymous identity/credential                                 | Internal UUID + hash; token in SecureStore, not app logs          | Authentication, security; assess User IDs category, deletion remains missing                             |
| Ghost name/avatar/participant ID                              | Room-scoped; stable during leave/rejoin                           | Social functionality; visible to room participants                                                       |
| Text messages and room names                                  | PostgreSQL persists, APIs and sockets deliver                     | App functionality; likely other in-app messages and/or other UGC classification; verify Console taxonomy |
| Room/membership activity, timestamps, retry keys              | Server rows                                                       | Functionality, ordering, anti-duplication; inspect app-activity declarations                             |
| Abuse reports/reporter membership                             | Private DB reason/reference/time                                  | Safety, investigation; privileged access, cascade retention                                              |
| Peer network information                                      | Limiter uses per-process keyed hashes; proxy may see raw IP       | Security/abuse prevention; deployment logging/location inference needs audit                             |
| Operational diagnostics                                       | API route/status/duration/request UUID                            | Operations; actual hosting/Expo/Google diagnostics and retention pending                                 |
| Contacts, microphone, media, camera, precise location, ads ID | Not used by implemented text MVP; release permission blocks added | Verify final manifest and every SDK before declaring absent                                              |

No advertising, analytics or payment SDK is configured in the app code reviewed.
This does not prove that no SDK/service processes diagnostics or device information.
Review Expo SDKs, EAS build/runtime distinction, Google Play services, hosting, DB,
TLS termination, backups, and support tooling. No E2EE exists. Transport encryption
requires deployed HTTPS/WSS; syntax checks do not prove deployment security.

The owner must decide collected/shared categories, required/optional processing,
purposes, encryption-in-transit answer, retention, deletion and recipients under
[Google's Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469).
Do not conflate recipient room delivery with an unreviewed no-sharing claim.
Account-deletion work is unresolved; do not mark the feature implemented. Internal-
only track form exemptions, if applicable in Console, do not eliminate underlying
privacy/safety work or justify a false declaration when expanding testing.
