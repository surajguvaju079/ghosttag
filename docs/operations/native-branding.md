# Branded Android installation and visual acceptance

Native build/install and visual acceptance are **pending**. The implementation
environment has Java 21 and EAS CLI, but no `adb`, `sdkmanager`, Android SDK path,
emulator, or attached Android device available. No cloud build was submitted.
JavaScript platform exports are not native APK builds. iOS compilation needs macOS
and Xcode and has not been performed here.

## Build prerequisites

The mobile workspace includes SDK-compatible `expo-dev-client`. Its `eas.json`
defines these independent profiles (no credentials or submit configuration):

| Profile     | Environment | Distribution | Android artifact | Runtime                              |
| ----------- | ----------- | ------------ | ---------------- | ------------------------------------ |
| development | development | internal     | APK              | Development client; Metro required   |
| preview     | preview     | internal     | APK              | Standalone release runtime; no Metro |
| production  | production  | store        | AAB              | Standalone store runtime             |

Approved configuration: name **GhostTag**, slug **ghosttag**, Android package
**com.ghosttag**, iOS bundle identifier **com.ghosttag**, deep-link scheme
**ghosttag**. Owner **surajguvaju** and EAS project ID
**ec4f917f-6671-4b01-be4e-0b0271542e91** were linked by the user and are preserved.
Do not reinitialize/relink the project, select an organization, or use a different
account. No remote account access was performed during release preparation.

Production AAB and draft internal submission details, versioning, endpoint gates,
policy blockers and required approvals are in the
[Google Play release checklist](../release/google-play/release-checklist.md) and
[submission runbook](../release/google-play/submission.md). Native branding checks
below still require an actual installed build.

The build commands below are operator instructions, **not authorization** to start
a cloud build, generate/replace signing credentials, or publish. Obtain approval
before each such action. Inspect credential prompts rather than accepting defaults.

Ensure EAS uses the approved project and credentials before submitting a build.
Cloud builds upload application sources and may consume build quota. Configure
the public API URL for each EAS environment; it is bundled into standalone builds.
Use a reachable HTTPS development API for the preview APK. Never put anonymous
credentials or other secrets in public Expo variables. For example, replacing
the example origin with your development API:

```sh
eas env:create --environment development --name EXPO_PUBLIC_API_URL --value https://dev-api.example.com/api/v1 --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://dev-api.example.com/api/v1 --visibility plaintext
# Update existing variables instead of creating duplicates if already configured.
eas build --platform android --profile development
```

Install the APK using the build page/QR on a physical Android device. With an SDK
and running emulator, the following downloads and installs the selected build:

```sh
eas build:run --platform android
```

Then start Metro from the repository root with your actual LAN address:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.20:8080/api/v1 pnpm --filter @ghosttag/mobile exec expo start --dev-client --lan --clear
```

The device must reach both Metro (8081) and the API (8080 in the checked-in example).
Use `10.0.2.2` for an Android emulator's API on its host. An Expo tunnel exposes
Metro only. Inspect firewall and guest-network isolation; see the
[two-device runbook](native-acceptance.md) for connectivity probes and USB routing.
Do not weaken production network policy for local HTTP. Use HTTPS when the native
build rejects cleartext traffic. Remove an obsolete socket-origin override if it
points at a different API host.

For standalone splash verification, build and install the preview APK separately:

```sh
cd apps/mobile
eas build --platform android --profile preview
```

Install using its build-page link/QR or `eas build:run --platform android` on an
emulator, choosing the preview build. No Metro server is required. These profiles
use the same application ID; installing one can replace the other. Avoid uninstall
or clearing app data when testing credential persistence.

If the local SDK becomes available, with the approved package configured:

```sh
adb devices
pnpm --filter @ghosttag/mobile exec expo run:android --device
# Standalone release runtime, using the project's normal local signing setup:
pnpm --filter @ghosttag/mobile exec expo run:android --variant release --device
```

These commands generate native directories and require the full Android toolchain;
do not commit generated native projects or change signing settings as a side effect.

## Visual acceptance (record device, OS, launcher, build, screenshots)

- On Android 13+ with a launcher supporting themed icons, toggle themed icons on
  and off. Verify white-derived ghost, oval eye holes and orbital ring are legible
  under at least two wallpaper palettes; no colored glow appears in themed mode.
- Inspect circle, rounded-square and squircle masks where the launcher supports
  them. Check app drawer, home screen, small icon sizes and long-press animation
  for clipping. Full-color mode uses the original mascot on midnight violet.
- Force-stop and cold-launch the **preview APK** in light and dark system modes.
  Verify the centered ghost keeps its proportions, midnight background remains,
  no stretching/cropping occurs, and transition into the branded loading/home
  screen has no unwanted white flash. Check Android 12+ system splash masking.
- Repeat splash/icon checks on an iOS standalone build when macOS/device tooling
  is available. Check iPhone/iPad layouts and launcher icon opacity/masking.
- Repeat the existing two-device functional acceptance checks after installation;
  specifically credential persistence after restart and switching network/app state.

Configuration and pixel checks support these checks but do not prove native
appearance. Expo Go uses its own launcher; development builds may show dev-launcher
UI and cannot fully replicate the standalone splash. See
[Expo splash guidance](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/),
[development builds](https://docs.expo.dev/develop/development-builds/introduction/),
and [installable Android APKs](https://docs.expo.dev/build-reference/apk/).
