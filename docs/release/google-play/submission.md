# Build and upload workflow — approval required

No cloud action is authorized by the existence of these commands. Owner: surajguvaju;
package: com.ghosttag; existing project link must remain unchanged. Do not log in,
relink, access accounts, generate/upload service-account keys or change signing
credentials as part of local preparation. Verify the personal account interactively
when the owner is ready; stop on a different account or organization.

## First AAB build (after blockers and explicit build/signing approval)

Configure EAS **production** environment with the real EXPO_PUBLIC_API_URL ending
in /api/v1, optional EXPO_PUBLIC_SOCKET_URL as HTTPS origin, and published
EXPO_PUBLIC_PRIVACY_URL / EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_COMMUNITY_URL. The
production profile supplies EXPO_PUBLIC_APP_ENV=production. Never use placeholders,
local development values or credentials in public environment variables.

```sh
cd apps/mobile
eas build --platform android --profile production
```

Do not add --auto-submit. Review signing prompts: reuse the approved upload key
and enable/manage Google Play App Signing only through the owner's approved Play
setup. Do not reset an existing key. EAS-managed credential storage and Play app
signing are separate trust boundaries. Google signs device APKs with the app-signing
key; uploaded AABs use the authorized upload key. Inspect the final AAB package,
versionCode, permissions, target API, release runtime, DNS/endpoints and build logs.

The build gate validates endpoint syntax, not deployment, legal approval, policy
compliance, moderation operations or native success. Complete those gates separately.
The local source starts at versionCode 1; check Play Console before every upload and
increment it for subsequent release artifacts. No automatic remote version setup.

## Manual first upload — retain a draft

After separate upload/account approval:

1. Sign into the approved Google Play Console developer account. Create/select the
   GhostTag app; package must be com.ghosttag. Complete developer verification and
   review Play App Signing prompts with the owner; never accept credential changes
   silently.
2. Open **Test and release → Testing → Internal testing** (Console labels can vary).
   Create a release and upload the reviewed production **.aab**, not a preview APK.
3. Confirm package/versionCode, app signing, target API and warnings. Add the reviewed
   en-US notes from release-notes.md. Save the release as a **draft**.
4. Complete App content, privacy URL, Data safety, audience, content rating, ads and
   app access declarations truthfully as required by Console. Give reviewers exact
   anonymous bootstrap/create/join instructions; never hand over production tokens.
5. Configure approved tester emails/Google Group and keep the opt-in URL private.
   Do not start rollout, send for review, publish or promote without separate approval.
6. Following rollout approval, install via the test opt-in link and execute the
   two-device/native/pre-launch plan. Keep a record of results and rollback/revoke
   access options. Internal testing is not proof of public-release eligibility.

## EAS Submit alternative — still an upload

The checked-in submit profile `internal` sets track=internal, releaseStatus=draft,
changesNotSentForReview=true. There is deliberately no key path, uploaded credential,
automatic submission, production submit profile or rollout configuration.

Only after explicit upload and service-account authorization, with an owner-approved
least-privilege Play service account already assigned securely in EAS:

```sh
cd apps/mobile
eas submit --platform android --profile internal --id APPROVED_EAS_BUILD_ID
```

Replace the build ID with the exact reviewed AAB build; do not use --latest and
risk selecting the wrong artifact. Missing service credentials are a blocker, not
permission to generate/upload them. Do not store key JSON in the repo. A draft upload
still transfers the artifact to Google; it is not a read-only check. Review the
result manually in Play Console. See [current Expo submission guidance](https://docs.expo.dev/submit/android/)
and [submit configuration](https://docs.expo.dev/eas/json/).
