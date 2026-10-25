# Minimal moderation workflow — operational proposal, not a staffed service

Current mechanism: active members report a public message ID within its room;
reports are private, deduplicated and reason-coded. There is no operator API,
moderation login/dashboard, status queue, automatic punishment or durable archive.
Existing retention may remove reports roughly an hour after room expiry, or later
under backlog. Review must fit that short window; staffing/cadence is an owner gate.

## Proposed smallest operational process

1. Assign named, trained reviewers and an urgent escalation contact, with reviewed
   DB access over a secure operator channel, least privilege and audit records.
   Do not give room owners access to reports or reporter identities.
2. Inspect pending report counts/oldest time frequently enough for the retention
   window. Use an access-controlled DB tool for content review; never copy private
   message text, credentials or reporter IDs into logs, shell output, screenshots,
   ordinary tickets, email or personal storage. No production queries were run here.
3. Resolve the report against the room/message internally. Outside the privileged
   tool refer only to public room/message/participant identifiers; never expose
   reporter identity or correlate identities across rooms for other users.
4. Apply only approved actions: an authorized operator can remove an offending DB
   message, lock an endangered room temporarily, or revoke an abusive credential.
   Revocation is global to that credential and needs appropriate authority; it is
   not the proposed participant's room-local block. Keep an action/time/reason audit
   without a content copy, under an owner-approved retention policy.
5. DB message deletion cascades reports and prevents future history retrieval;
   there is currently no message-removal event to purge already cached client
   messages. Room locks/revocation are checked on access/delivery and invalidation
   sweeps, but already delivered/queued packets cannot be recalled. Test and resolve
   these limits rather than promising instant removal everywhere.
6. Escalate credible threats/CSAE/CSAM under legal guidance, applicable reporting
   duties and designated contacts. Do not establish a private evidence archive
   silently: preserving evidence beyond room cleanup changes the privacy model.
7. Define user feedback/appeals, action authorization, reviewer coverage, evidence
   retention and escalation deadlines before rollout. Track counts/time-to-review
   without identities/content in telemetry. A report is not a guaranteed response.

Server-enforced blocking and identity deletion remain separate implementation
milestones pending the domain/privacy decisions in release-checklist.md. No new
admin platform or unauthenticated moderation endpoint has been introduced.
