import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiClient, ApiError } from "../src/api/client";
import type { IdentityStatus } from "../src/api/contracts";
import { Session } from "../src/auth/session";

const eligible: IdentityStatus = {
  ageEligibility: {
    status: "ELIGIBLE",
    method: "DECLARED_DOB",
    assessedAt: "2026-11-01T00:00:00.000Z",
    policyVersion: "18-plus-v1",
  },
  socialAccessEnabled: true,
};
const required: IdentityStatus = {
  ...eligible,
  ageEligibility: {
    ...eligible.ageEligibility,
    status: "REQUIRED",
    assessedAt: null,
    method: null,
  },
};
const denied: IdentityStatus = {
  ...eligible,
  ageEligibility: { ...eligible.ageEligibility, status: "INELIGIBLE" },
};
const error = (code: string, statusCode = 403) =>
  new ApiError({ code, statusCode, message: "No private data" });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(initial: string | null = "saved") {
  let stored = initial,
    creates = 0;
  let current = required;
  let assessmentError: unknown;
  const session = new Session(
    {
      get: async () => stored,
      set: async (token) => {
        stored = token;
      },
      clear: async () => {
        stored = null;
      },
    },
    {
      createIdentity: async () => {
        creates++;
        return "new";
      },
      validateIdentity: async () => current,
      assessAge: async () => {
        if (assessmentError) throw assessmentError;
        return current;
      },
    },
  );
  return {
    session,
    stored: () => stored,
    creates: () => creates,
    set: (value: IdentityStatus) => {
      current = value;
    },
    fail: (value: unknown) => {
      assessmentError = value;
    },
  };
}
for (const initial of [null, "saved"])
  test(`new/existing identity ${initial} stays gated before eligibility`, async () => {
    const h = harness(initial);
    await h.session.bootstrap();
    assert.equal(h.session.state.status, "screening");
    assert.equal(h.session.state.token, initial ?? "new");
    assert.equal(h.stored(), initial ?? "new");
    h.set(eligible);
    await h.session.assessAge("2000-01-01");
    assert.equal(h.session.state.status, "ready");
    assert.equal(h.creates(), initial ? 0 : 1);
  });
test("ineligible assessment keeps the credential, suppresses retry and offers no replacement", async () => {
  const h = harness();
  await h.session.bootstrap();
  h.set(denied);
  await h.session.assessAge("2020-01-01");
  assert.equal(h.session.state.status, "ineligible");
  h.set(eligible);
  await h.session.assessAge("2000-01-01");
  assert.equal(h.session.state.status, "ineligible");
  assert.equal(h.stored(), "saved");
  assert.equal(h.creates(), 0);
});
test("eligible identities cannot enter social routes while rollout is disabled", async () => {
  const h = harness();
  h.set({ ...eligible, socialAccessEnabled: false });
  await h.session.bootstrap();
  assert.equal(h.session.state.status, "unavailable");
  h.set(eligible);
  await h.session.revalidate();
  assert.equal(h.session.state.status, "ready");
});
test("network/validation errors allow screening retry with the same credential", async () => {
  const h = harness();
  await h.session.bootstrap();
  for (const failure of [
    new Error("offline"),
    error("INVALID_BIRTH_DATE", 400),
  ]) {
    h.fail(failure);
    await h.session.assessAge("2000-01-01");
    assert.equal(h.session.state.status, "screening");
    assert.ok(h.session.state.error);
  }
  h.fail(undefined);
  h.set(eligible);
  await h.session.assessAge("2000-01-01");
  assert.equal(h.session.state.status, "ready");
  assert.equal(h.creates(), 0);
});
test("assessment rate limits suppress repeat submissions until the retry deadline", async () => {
  const h = harness();
  await h.session.bootstrap();
  h.fail(
    new ApiError({
      code: "RATE_LIMITED",
      statusCode: 429,
      message: "wait",
      retryAfterMs: 60_000,
    }),
  );
  await h.session.assessAge("2000-01-01");
  h.fail(undefined);
  h.set(eligible);
  await h.session.assessAge("2000-01-01");
  assert.equal(h.session.state.status, "screening");
});
test("foreground policy/eligibility changes unmount social access without replacing identity", async () => {
  const h = harness();
  h.set(eligible);
  await h.session.bootstrap();
  h.set(required);
  await h.session.revalidate();
  assert.equal(h.session.state.status, "screening");
  h.set(denied);
  await h.session.revalidate();
  assert.equal(h.session.state.status, "ineligible");
  assert.equal(h.stored(), "saved");
  assert.equal(h.creates(), 0);
});
test("obsolete foreground responses cannot undo an assessment", async () => {
  let resolve!: (value: IdentityStatus) => void;
  let calls = 0;
  const session = new Session(
    { get: async () => "saved", set: async () => {}, clear: async () => {} },
    {
      createIdentity: async () => "unused",
      validateIdentity: async () =>
        ++calls === 1
          ? required
          : new Promise((done) => {
              resolve = done;
            }),
      assessAge: async () => eligible,
    },
  );
  await session.bootstrap();
  const foreground = session.revalidate();
  await tick();
  await session.assessAge("2000-01-01");
  resolve(required);
  await foreground;
  assert.equal(session.state.status, "ready");
});
test("age failures from REST/socket preserve credentials and ignore replaced identities", async () => {
  const h = harness();
  h.set(eligible);
  await h.session.bootstrap();
  h.session.rejectAccess("old-token", error("AGE_INELIGIBLE"));
  assert.equal(h.session.state.status, "ready");
  h.session.rejectAccess("saved", error("AGE_SCREENING_REQUIRED"));
  assert.equal(h.session.state.status, "screening");
  h.session.rejectAccess("saved", error("SOCIAL_ACCESS_DISABLED", 503));
  assert.equal(h.session.state.status, "unavailable");
  assert.equal(h.stored(), "saved");
});
test("API fails closed on an older backend", async () => {
  const api = new ApiClient(
    "https://example.test/api/v1",
    (async () =>
      new Response(JSON.stringify({ identityId: "private" }))) as typeof fetch,
  );
  await assert.rejects(api.validateIdentity("token"), {
    message: "ELIGIBILITY_UNAVAILABLE",
  });
});
