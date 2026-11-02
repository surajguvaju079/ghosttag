# App-wide 18+ eligibility

Approved implementation scope: declared age screening for new and existing anonymous
identities, with public social access disabled by default. Android is the first
intended distribution platform. This milestone does not implement companionship
matching, persistent participant blocking, or verified age assurance.

## Policy and data

The server calculates whether a declared date of birth has reached its eighteenth
anniversary on the current UTC date. February 29 anniversaries fall on March 1 in
non-leap years. The birthday must be an exact, valid YYYY-MM-DD date, not future or
year zero. It is processed transiently, never persisted or echoed in responses or
application logs. Infrastructure request-body logging must remain disabled.

AgeEligibility has one row per anonymous user: result (ELIGIBLE/INELIGIBLE), method
(DECLARED_DOB), assessment time and policy version. No historical assessment log,
public age, birthday, document or biometric is added. The row follows the identity's
lifetime and cascades on identity deletion; room cleanup does not remove it.
Current identity deletion/backup retention release gates remain unresolved.

No row, or a row for a different AGE_POLICY_VERSION, means REQUIRED. The first valid
assessment for the current version wins, including under concurrent requests.
Later valid submissions return that row unchanged; invalid dates still return 400.
A denied result has no self-service correction/retry for that policy. A future policy
version permits a new assessment and replaces the row. Changing versions must
represent a deliberate owner decision, not a way to erase individual denials.

Start fresh creates a different identity and can bypass declarations. No persistent
device tracking or age-verification claim is introduced. Birthday declarations do
not prove adulthood; platform controls and any stronger assurance required in the
chosen launch countries remain separate release work.

## Authorization and concurrency

Identity creation, status and assessment require no eligibility; status/assessment
still authenticate. All room HTTP endpoints require authentication, enabled social
access and current ELIGIBLE status. Message history/reports repeat eligibility within
the message transaction. Socket connection, every event, periodic checks and
per-recipient message delivery enforce the same policy.

Lock order for messaging is credential FOR SHARE, anonymous user FOR SHARE, then the
existing room lock. Assessment writers lock the anonymous user FOR UPDATE before
reading/upserting its assessment. Any other eligibility writer must follow this
parent-lock protocol. The message shared lock lasts through authorization, content
access and enqueue; queued packets cannot be recalled. Existing credential checks
and membership/expiry checks remain authoritative.

SOCIAL_ACCESS_ENABLED defaults to false and only the exact string `true` enables it.
Disabled social access returns 503 SOCIAL_ACCESS_DISABLED. Enabled access with no
current assessment returns 403 AGE_SCREENING_REQUIRED; an ineligible assessment
returns 403 AGE_INELIGIBLE. These are not invalid-credential errors. The existing
socket session:invalidated envelope carries these failures, followed by disconnect.
Cleanup/unsubscription state is also cleared when a socket is denied.

## Mobile

Session bootstrap validates eligibility after both loading and creating a credential.
A neutral birthday screen has separate Year, Month, and Day selectors with no
preselected date or adult default. Day choices follow the selected month and year,
and future dates cannot be selected. The credential stays
in SecureStore; birthdays exist only in the form/request memory and are cleared after
submission or screen teardown. Existing memberships survive screening. Eligibility,
ineligibility and disabled-access screens mount instead of social routes, including
for direct room links. Safety and policy information is accessible within the gate.

Foreground status changes and REST/socket access failures return to the gate,
disconnect sockets and clear displayed chat content without replacing credentials.
Transient foreground network failures retain the session; the server continues to
authorize every operation. Late responses from replaced identities or obsolete
assessment/foreground requests cannot restore access. Old/malformed identity-status
responses fail closed. Browser preview still loses its credential on reload.

## Rollout

Apply the migration and regenerate Prisma, deploy the backend with social access
disabled, then update mobile clients. Existing identities remain unscreened; no
membership backfill/deletion occurs. Older clients cannot bypass server enforcement
and need upgrading to screen. Tests explicitly enable access and create eligible
fixtures; no real/development identities are automatically marked eligible.

No production deployment or Play Console changes are part of this change. Before
public release, settle launch countries, the required assurance mechanism, legal
notices, moderation and other release gates. Configure Play's 18-and-over audience
and Restrict Minor Access. An age gate does not resolve Apple's separate restrictions
on services used primarily for random or anonymous chat.

Sources: [Play age restrictions](https://support.google.com/googleplay/android-developer/answer/16302250),
[Play audience and screening](https://support.google.com/googleplay/android-developer/answer/9867159),
[Apple guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).
