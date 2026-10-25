# Production backend readiness — no deployment performed

## Audit findings

| Control        | Source evidence                                                                                                                                                            | Deployment work / acceptance                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TLS and WSS    | Nest listens plain HTTP; Socket.IO namespace /rooms, websocket transport                                                                                                   | Owner-operated HTTPS reverse proxy, trusted certificate, WSS Upgrade forwarding, idle timeouts; mobile auth smoke on external networks                                                                                         |
| Origins        | No explicit REST CORS or Socket.IO origin allowlist                                                                                                                        | Native clients do not need browser CORS. Document required browser clients; exact allowlist and trusted edge policy need approval. CORS alone never authorizes a socket/native client                                          |
| Credentials    | SHA-256 hashes, server token validation, expiry/revocation checks on events/delivery                                                                                       | Secrets manager, least-privilege DB, rotate infrastructure secrets; no tokens in URLs/health/logs                                                                                                                              |
| Environment    | Startup validates NODE_ENV, integer PORT/range and PostgreSQL URL; production requires DB config and rejects the known Compose password; rate/retention settings validated | Validate deployment secrets, DB TLS/network policy and least-privilege role independently; default environment is development, so the deployment must explicitly set NODE_ENV=production. No production connectivity is proven |
| Database       | Prisma migrations, PostgreSQL authoritative                                                                                                                                | Review migration SQL and backups, migration lock/maintenance plan; apply only to explicitly confirmed production target after deployment approval                                                                              |
| Expiration     | Persisted expiresAt + checks; bounded startup/minute cleanup                                                                                                               | Monitor oldest cleanup backlog, failures and RETENTION_ENABLED; one-hour default grace is eligibility, not exact deletion SLA                                                                                                  |
| Rate limits    | Identity/direct-peer hashed in-memory counters                                                                                                                             | One API process only. Edge handshake/HTTP controls required; proxies share a peer quota. Trusted proxy handling/shared limiter needs reviewed design before scaling                                                            |
| Logging/errors | Route templates/status/timing, safe structured REST/socket errors                                                                                                          | Disable raw proxy query/header/body/DB parameter logging. Define access, retention and incident procedures; test error paths do not disclose secrets                                                                           |
| Health         | GET /api/v1/health checks SELECT 1; returns degraded body on DB failure                                                                                                    | Probe response body as well as HTTP status; external uptime, WSS auth, DB metrics and alerts need configured coverage                                                                                                          |
| Monitoring     | Generic runtime warnings available                                                                                                                                         | No shipped dashboard/alerting/on-call/backup automation or CI/CD was found                                                                                                                                                     |

## Production launch gates

- Owner supplies real domain(s), provider/region, TLS termination and secrets policy.
  Verify public DNS from multiple resolvers and devices, TLS chain/expiry, HTTPS
  redirects, no mixed HTTP/WSS, max body limits, WSS Upgrade and namespace paths.
- Single live API instance until authorized multi-instance fanout/limiter design.
  Configure edge limits, secure operator access and firewall; PostgreSQL must not
  expose the Compose development port publicly. Compose credentials are local only.
- Build/generate Prisma client from the lockfile; review and stage migrations on a
  disposable DB first. Approved operator commands: prisma migrate status, migrate
  deploy, generate. No db push/reset or production fixture tests. Confirm target
  privately; never print a credential-bearing DATABASE_URL.
- Set NODE_ENV=production; validate port range, DB URL/SSL, connection limits and
  no development credentials. Do not expose the DB health connection secrets.
- Exercise room capacity, idempotent sends, credential revocation, locking, expiry,
  cleanup restart recovery and new consent/block/deletion controls before exposure.
- Define provider-managed backup/PITR and WAL/replica retention, encrypted storage,
  separate access, restore destinations and incident ownership. There is no current
  automated backup/restore configuration to claim verified.

## Backup and restore rehearsal (operator proposal)

After approval and target confirmation, take an encrypted provider snapshot or a
pg_dump custom-format backup using a secret-managed connection (never shell-history
passwords). Restore with pg_restore into a new isolated recovery database, never
--clean against a live primary. Validate schema/migration history, row counts,
referential integrity, health and synthetic application smoke tests. Measure RPO/RTO,
record evidence, then securely destroy test copies under the approved retention
policy. Reapply revocations/deletions after recovery so restored credentials/data
are not accidentally resurrected. Define this mechanism before claiming deletion
exceptions are enforced. Choose actual retention/RPO/RTO with the owner; none is
invented here.

## Operations owner signoff

Record operator/date, backend/migration version, TLS/WSS tests, firewall, data
processors, backup/restore drill, cleanup backlog, alert routing, report coverage,
access review and rollback plan. These tasks require production access and remain
pending. This checklist does not deploy or verify an existing public backend.
