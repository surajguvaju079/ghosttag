# Privacy policy — DRAFT, NOT PUBLISHED OR ACCEPTABLE AS FINAL NOTICE

Owner/legal review required. Operator name, effective date, contact, public URL,
legal bases/rights by country, processors and security commitments are **pending**.
This draft describes source-code behavior, not an audited production deployment.
Do not present placeholders as a published policy or certify it in Play Console.

## Observed application data

The server creates an internal anonymous identity and a credential hash. The app
stores its bearer credential in native SecureStore and sends it over authenticated
requests. Native secure storage is device-bound where supported; OS uninstall/
backup behavior needs device verification. The server credential can have expiry or
revocation timestamps; current creation sets neither automatic expiry nor deletion.
No email/phone/password login is requested by this MVP.

Room membership stores room-specific ghost name/avatar, role, timestamps and status.
The backend stores room details, text messages, idempotency keys and private abuse
reports. Room/message public identifiers do not expose internal user UUIDs. Some
legacy identity/create-room API responses still contain internal IDs; mobile drops
them. This is technical debt, not a promise that no internal ID is ever transmitted.

Recipients in a room receive its messages and participant information. Reports are
not broadcast. Credential hashes, internal identity links and report metadata are
accessible to authorized infrastructure operators, not ordinary room participants.
This app is not end-to-end encrypted. Other users can copy content.

## Retention actually implemented

Rooms become inaccessible at expiresAt (normally 24 hours after creation). A bounded
startup/minute cleanup sweep becomes eligible one hour after expiry by default;
load, downtime and failures can delay physical removal. Reports cascade with their
message/reporter membership and currently do not preserve evidence after room
cleanup. Anonymous users and credentials are NOT removed by room cleanup.
Start fresh removes/replaces this device's token; it does not delete server data.
There is no self-service identity-deletion endpoint or external request procedure yet.
These are release blockers, not features described as available.

The API's app logs use route templates/status/timing/request UUIDs, not message
bodies/tokens. Its in-memory limiter hashes peer/identity keys with a process salt
and resets on restart. Hosting, TLS proxy, database logs, backups/WAL, diagnostics,
Expo/Google services and future SDK behavior need separate inventory and retention
signoff. Do not claim zero IP collection or no third-party transfers before that audit.

## Owner must finish

Publish accurate collection purposes, recipients/processors/countries, access and
deletion methods, security practices, legal rights, child policy and contacts.
Approve deletion exceptions and backup/log retention; implement and test the user
flow before claiming deletion is available. Identify an independent public web
request route and recovery/verification process for users without app access.
Maintain the policy as implementation/hosting changes. See [Data safety inventory](data-safety-inventory.md)
and [Google user-data requirements](https://support.google.com/googleplay/android-developer/answer/10144311).
