import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ApiError } from "../src/api/client";
import { canOfferOfflineAds } from "../src/auth/offline-availability";

function apiFailure(statusCode: number, code = "REQUEST_FAILED") {
  return new ApiError({ statusCode, code, message: "Request failed" });
}

test("offline ad entry accepts network outages and missing bootstrap routes", () => {
  assert.equal(canOfferOfflineAds(apiFailure(0, "NETWORK_ERROR")), true);
  assert.equal(canOfferOfflineAds(apiFailure(503)), true);
  assert.equal(canOfferOfflineAds(apiFailure(404)), true);
  assert.equal(canOfferOfflineAds(apiFailure(405)), true);
});

test("offline ad entry does not treat local or access errors as an outage", () => {
  assert.equal(canOfferOfflineAds(new Error("SecureStore unavailable")), false);
  assert.equal(canOfferOfflineAds(apiFailure(401)), false);
  assert.equal(canOfferOfflineAds(apiFailure(403, "AGE_INELIGIBLE")), false);
  assert.equal(canOfferOfflineAds(apiFailure(429, "RATE_LIMITED")), false);
});
