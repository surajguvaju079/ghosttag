# Companionship matching and stable invitations

Approved scope: English casual matching, optional local conversation starters,
private two-person rooms, Block and end, stable group-room links and browser fallback
pages in portfolio-suraj. Both SOCIAL_ACCESS_ENABLED and MATCHING_ENABLED default
false. No deployment, signing, or public rollout is authorized by this milestone.

Themed matching adds an optional search topic (`open`, `music`, `games`, or
`deep-talk`). New clients choose before searching; older clients default to
`open`. A search pairs only with another active search for the exact same topic.
There is no cross-topic fallback, preference history, or topic in a public
profile. A running search keeps its topic until cancelled or expired. The same
two-minute search deadline applies; someone may wait longer or need to search
again when their topic has fewer people. Migration
`20261109000000_matching_topics` adds the indexed topic to temporary searches.

## State and authorization

PostgreSQL stores one search per identity (public s_ UUID, two-minute deadline,
30-second lease) and a matched session per private room (public c_ UUID, two internal
parties, extension votes). Searches are driven by starts/foreground five-second
heartbeats, not process timers. Expired/cancelled searches cannot be resurrected by
heartbeats. Repeat starts return the existing search/match. Cancel racing a committed
pair returns the matched state rather than ending it. One live matched room/search
per identity; participation in ordinary group rooms is independent.

Matching mutations take one transaction-scoped PostgreSQL advisory lock, then lock
credentials, identity eligibility and room rows in that order. Candidates are FIFO,
excluding self and blocks in either direction. Recheck both parties' credentials and
eligibility, search lease and deadline under the transaction before pairing. Create
the room and both memberships atomically. A candidate with invalid credentials or
eligibility is not paired. Dedicated start (6 identity/60 network per minute), heartbeat
(30/300 per minute) and action (30/120 per minute) rate policies use the existing limiter.
MATCHING_ENABLED gates new searches; end/block/clear controls remain available to
eligible authenticated identities when searching is disabled.

Rooms gain GROUP (default) and MATCHED kinds. Matched rooms have no invites and admit
only their assigned ACTIVE memberships. Neither a leaked room code nor a direct API
join admits a third person. Their lifetime starts at creation for 15 minutes. Each
party may request extension before expiry; both votes add exactly 15 minutes to the
original deadline once, for a maximum of 30 minutes. Closing/backgrounding preserves
the conversation; explicit end or normal room leave expires it for both. Session
polling/foreground refresh synchronizes extensions; a server-confirmed extension may
recover from a client-local deadline, without sending while access is unconfirmed.

Private block rows store blocker, blocked identity and creation time only. Blocking
from a match or a group room uses the same private relation. It ends an active match,
leaves every active group room shared by the blocker and blocked identity, and denies
future group joins in either direction while one is an active member. Join and block
transactions share the matching advisory lock so a concurrent join cannot create a
new overlap. The block target is selected by a room-scoped public participant ID;
internal identities never appear in responses. The join error names no blocker.
Blocks survive room cleanup until the blocker clears all their own blocks or an
identity is deleted. Clearing does not rejoin rooms. Identity resets can bypass
blocks and declared age screening. Normal room cleanup cascades matched-session rows;
bounded search cleanup removes expired leases. No permanent match history is added.
The participant-report migration also separates active group memberships for blocks
that existed before this rule was introduced.

An active member can privately report another active participant without selecting a
message. Reports use the existing fixed reasons and 202 acknowledgement, deduplicate
per reporter/target/room, and cascade with room membership/content cleanup. Reporting
does not automatically block or punish; blocking does not automatically report.
Moderators must review reports within the temporary retention window.

## Stable group invites

Each group room gets an independent random UUID invite ID. Existing group rooms are
backfilled; matched rooms have none. Canonical URL:
https://surajguvaju.com.np/ghosttag/join/GH-1234/<inviteId>

Invite joins resolve both code and invite against the same locked room, enforcing
kind, age, social availability, expiry, locks and capacity. IDs are public room
references, not credentials. A deleted ID never resolves to a recycled room code.
Existing manual code joins retain their semantics. Browser GET/link-preview requests
never join rooms or retrieve private metadata. The app preserves validated pending
invites in memory across bootstrap/screening and asks for explicit Join.

Android verifies only /ghosttag/join/ on surajguvaju.com.np. The portfolio hosts the
root /.well-known/assetlinks.json; missing real signing fingerprints produce an empty
association array, not fabricated verification. The website offers a manual Open app
custom-scheme fallback and Copy code. Install appears only for an explicitly
configured valid Play listing. Retap the link after installation; no deferred-link or
tracking SDK is added. Native verified HTTPS behavior needs the actual Play signing
fingerprint, deployed association endpoint and rebuilt Android app.

## Verification and deployment

Exercise pairing/cancellation/block races in disposable PostgreSQL databases and
private room access over HTTP/Socket.IO. Test expiry, extensions, stale responses,
background cancellation, code-reuse invites, pending links and default-off flags.
Validate mobile and portfolio builds and browser flows. Native cold/warm links,
Android accessibility/keyboard and real certificate verification remain device checks.
Apply migrations and regenerate Prisma before backend/mobile deployment. Keep both
flags off while country/assurance/moderation and other existing release gates remain
unresolved. Update portfolio privacy/safety descriptions with the implemented data
handling and keep public availability accurately described as development-stage.
