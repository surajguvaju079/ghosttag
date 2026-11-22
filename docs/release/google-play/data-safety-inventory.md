# Data safety inventory — draft, not a completed Play declaration

Collection includes transmission off-device, even when users have no named account.
Use this source inventory to complete Play Console only after production/SDK review.
Room TTL alone is not a basis to declare all processing ephemeral or no data collected.

| Data                                                          | Actual code behavior                                              | Purpose / recipients / open question                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Anonymous identity/credential                                 | Internal UUID + hash; token in SecureStore, not app logs          | Authentication, security; assess User IDs category, deletion remains missing                             |
| Ghost name/avatar/participant ID                              | Room-scoped; stable during leave/rejoin                           | Social functionality; visible to room participants                                                       |
| Text messages and room names                                  | PostgreSQL persists, APIs and sockets deliver                     | App functionality; likely other in-app messages and/or other UGC classification; verify Console taxonomy |
| Short original-voice recordings                               | User records on device; authenticated upload stores bytes in PostgreSQL until room cleanup | Social functionality and abuse review; assess audio/voice and UGC categories, recipients, backups and deletion |
| Room/membership activity, timestamps, retry keys              | Server rows                                                       | Functionality, ordering, anti-duplication; inspect app-activity declarations                             |
| Abuse reports/reporter membership                             | Private DB reason/reference/time                                  | Safety, investigation; privileged access, cascade retention                                              |
| Peer network information                                      | Limiter uses per-process keyed hashes; proxy may see raw IP       | Security/abuse prevention; deployment logging/location inference needs audit                             |
| Operational diagnostics                                       | API route/status/duration/request UUID                            | Operations; actual hosting/Expo/Google diagnostics and retention pending                                 |
| Microphone permission                                         | Requested only after a native user taps Record                    | Required for short room voice messages; verify final manifest and Play disclosure                         |
| Contacts, camera, other media, precise location               | Not used by the current app; release permission blocks added      | Verify final manifest and every SDK before declaring absent                                              |
| AdMob banner and optional interstitial                         | Mobile Ads SDK is configured for Android; requests can transmit device/network and ad interaction data to Google | Review the actual SDK data disclosures, consent flow, Play Data safety answers and privacy policy before upload |
| Advertising ID                                                 | Android AD_ID permission remains blocked                          | Confirm merged release manifest and limited-ID behavior; do not claim the Ads SDK collects nothing       |

An advertising SDK is now configured. No payment SDK is configured.
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

## Age screening addition

Date of birth is transmitted to the API for transient eligibility calculation and is
not retained or echoed by application code. Do not describe it as never collected.
The result, declared assessment method, time and policy version are retained against
the internal anonymous identity, beyond room expiry. No verification documents or
biometrics are added. Reassess Play declarations, policy notices, infrastructure-body
logging and launch-country obligations before enabling social access.

When the API is unavailable at startup, a separate local date check gates the
optional ad. That date stays in form memory and is discarded after the check; it is
not sent to AdMob or used to grant social access.
