# Age eligibility API

Identity status and assessment require the existing anonymous bearer credential.
Responses use Cache-Control: no-store and expose no new internal identifiers.

## GET /api/v1/identity/me

Preserve the existing identityId field and add:

```json
{
  "ageEligibility": {
    "status": "REQUIRED",
    "method": null,
    "assessedAt": null,
    "policyVersion": "18-plus-v1"
  },
  "socialAccessEnabled": false
}
```

Status is REQUIRED, ELIGIBLE or INELIGIBLE. Current assessments have method
DECLARED_DOB and an ISO UTC assessedAt; REQUIRED has null method/time. policyVersion
is the current server policy. Status is available even when social access is disabled.
The mobile app continues to discard the legacy identityId.

## POST /api/v1/identity/age-eligibility

Body: `{ "dateOfBirth": "2000-01-01" }`. No extra fields or user selector are accepted.
A successful valid assessment returns 200 with the same added fields shown above.
Eligibility requires reaching 18 on the current UTC date; February 29 birthdays reach
the threshold March 1 in non-leap years. Invalid/nonexistent/future dates return
400 INVALID_BIRTH_DATE without recording an assessment or echoing the input.

The first valid assessment for the current policy is immutable. Repeated valid
requests return the same result/time, even if a different birthday is supplied.
A policy change requires assessment again and replaces the prior row. The birthday
is not stored or returned. Screening is a declaration, not verified age assurance.

Attempts are limited to five per identity and thirty per network per hour, including
rejected/duplicate submissions. Existing SAFETY_AGE_ASSESSMENT_IDENTITY_LIMIT,
SAFETY_AGE_ASSESSMENT_NETWORK_LIMIT and SAFETY_AGE_ASSESSMENT_WINDOW_MS configuration
can tune them. Exhaustion uses 429 RATE_LIMITED, retryAfterMs and Retry-After.
Authentication runs before identity-scoped limits.

## Social endpoints and sockets

All room endpoints, history, reports, socket connections/events and deliveries require
current eligibility and enabled social access. Failure order is authentication,
SOCIAL_ACCESS_DISABLED (503), then AGE_SCREENING_REQUIRED or AGE_INELIGIBLE (403),
followed by existing room/membership validation. Authentication and validation errors
remain distinct. Neither membership nor possession of a room code bypasses age checks.
Socket failures reuse structured connect_error/ack and session:invalidated errors;
mobile must preserve credentials and return to screening/unavailability rather than
create another identity. See [architecture](../architecture/age-eligibility.md).
