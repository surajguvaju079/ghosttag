import { strict as assert } from "node:assert";
import { test } from "node:test";
import { locallyAdult } from "../src/ads/offline-eligibility";

test("offline ad check follows the server's eighteenth anniversary rule", () => {
  const today = new Date("2026-11-22T12:00:00.000Z");
  assert.equal(locallyAdult("2008-11-22", today), true);
  assert.equal(locallyAdult("2008-11-23", today), false);
  assert.equal(locallyAdult("2008-02-29", new Date("2026-02-28T23:59:59Z")), false);
  assert.equal(locallyAdult("2008-02-29", new Date("2026-03-01T00:00:00Z")), true);
});

test("offline ad check fails closed for invalid dates", () => {
  const today = new Date("2026-11-22T12:00:00.000Z");
  for (const value of ["", "2008-02-30", "0000-01-01", "2027-01-01", "11/22/2008"])
    assert.equal(locallyAdult(value, today), false);
});
