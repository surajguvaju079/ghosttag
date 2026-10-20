import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { configuration } from "../src/api/client";
import { assertProductionEndpoints } from "../src/api/release-policy";

const require = createRequire(import.meta.url);
const appConfig = require("../app.config.js");
const base = require("../app.json").expo;
const eas = require("../eas.json");
const api = "https://api.release-fixture.net/api/v1"; // Syntax fixture, not a deployed endpoint.

test("production rejects local, private, IP, insecure and ambiguous endpoint forms", () => {
  for (const value of [
    undefined,
    "",
    "http://api.release-fixture.net/api/v1",
    "https://localhost/api/v1",
    "https://127.0.0.1/api/v1",
    "https://10.0.2.2/api/v1",
    "https://192.168.1.20/api/v1",
    "https://172.28.12.10/api/v1",
    "https://[::1]/api/v1",
    "https://2130706433/api/v1",
    "https://api.internal/api/v1",
    "https://api.local/api/v1",
    "https://localhost./api/v1",
    "https://api.example.com/api/v1",
    "https://127.0.0.1.nip.io/api/v1",
    "https://user:secret@api.release-fixture.net/api/v1",
    `${api}?secret=x`,
    `${api}#fragment`,
    "https://api.release-fixture.net:8080/api/v1",
    "https://api.release-fixture.net",
    ` ${api}`,
  ])
    assert.throws(() => assertProductionEndpoints(value), String(value));
});
test("production validates Socket.IO independently and derives a secure origin", () => {
  assert.deepEqual(configuration(api, undefined, true), {
    apiUrl: api,
    socketUrl: "https://api.release-fixture.net",
  });
  for (const socket of [
    "http://192.168.1.2",
    "https://localhost",
    "wss://api.release-fixture.net",
    "https://api.release-fixture.net/rooms",
  ])
    assert.throws(() => configuration(api, socket, true));
  assert.doesNotThrow(() =>
    configuration(api, "https://socket.release-fixture.net", true),
  );
  assert.doesNotThrow(() =>
    configuration("http://10.0.2.2:8080/api/v1", undefined, false),
  );
});
test("Expo production config fails closed and preserves owner/linkage/branding", () => {
  const keys = [
    "EAS_BUILD_PROFILE",
    "EXPO_PUBLIC_APP_ENV",
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_SOCKET_URL",
    "EXPO_PUBLIC_PRIVACY_URL",
    "EXPO_PUBLIC_TERMS_URL",
    "EXPO_PUBLIC_COMMUNITY_URL",
  ];
  const saved = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    process.env.EAS_BUILD_PROFILE = "production";
    assert.throws(() => appConfig({ config: base }));
    process.env.EXPO_PUBLIC_APP_ENV = "production";
    process.env.EXPO_PUBLIC_API_URL = "http://10.0.2.2:8080/api/v1";
    assert.throws(() => appConfig({ config: base }));
    process.env.EXPO_PUBLIC_API_URL = api;
    assert.throws(() => appConfig({ config: base }));
    process.env.EXPO_PUBLIC_PRIVACY_URL =
      "https://policies.release-fixture.net/privacy";
    process.env.EXPO_PUBLIC_TERMS_URL =
      "https://policies.release-fixture.net/terms";
    process.env.EXPO_PUBLIC_COMMUNITY_URL =
      "https://policies.release-fixture.net/community";
    const result = appConfig({ config: base });
    assert.equal(result.owner, "surajguvaju");
    assert.equal(result.extra.eas.projectId, base.extra.eas.projectId);
    assert.deepEqual(result.android.adaptiveIcon, base.android.adaptiveIcon);
    assert.deepEqual(result.plugins, base.plugins);
    assert.ok(
      result.android.blockedPermissions.includes(
        "android.permission.SYSTEM_ALERT_WINDOW",
      ),
    );
  } finally {
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    });
  }
});
test("release profiles use AAB, explicit local versioning and draft internal submission", () => {
  assert.ok(
    Number.isSafeInteger(base.android.versionCode) &&
      base.android.versionCode >= 1,
  );
  assert.equal(eas.cli.appVersionSource, "local");
  assert.equal(eas.build.production.android.buildType, "app-bundle");
  assert.equal(eas.build.production.developmentClient, false);
  assert.equal(eas.build.production.env.EXPO_PUBLIC_APP_ENV, "production");
  for (const name of ["development", "preview"])
    assert.equal(eas.build[name].android.buildType, "apk");
  assert.deepEqual(eas.submit.internal.android, {
    track: "internal",
    releaseStatus: "draft",
    changesNotSentForReview: true,
  });
});
