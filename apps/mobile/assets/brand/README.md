# GhostTag brand assets

Approved visual reference: `docs/design/ghosttag-brand-reference.png`.
The reference board stays in documentation; it is not bundled as application UI.
The home screen and credential/loading screen use the ghost mascot, white/pink
wordmark, "Real people. Temporary places." tagline, midnight violet background,
subtle stars, and purple layered waves. Wave shapes and typography are native UI;
room vibes retain the four existing backend values.

## Files

| File                      | Use                                                                |
| ------------------------- | ------------------------------------------------------------------ |
| `ghost-mascot.png`        | Original generated transparent mascot master                       |
| `app-icon-source.png`     | Original generated opaque icon master                              |
| `mascot.png`              | 512×512 transparent UI mascot                                      |
| `app-icon.png`            | 1024×1024 opaque RGB iOS/general app icon                          |
| `adaptive-foreground.png` | 1024×1024 transparent Android foreground with 128px canvas margins |
| `monochrome-source.png`   | Generated black/white stencil master of the ghost and orbital ring |
| `adaptive-monochrome.png` | 1024×1024 white-only transparent Android themed-icon layer         |
| `splash.png`              | 1024×1024 transparent native splash image                          |
| `favicon.png`             | 64×64 opaque web favicon                                           |

The Android adaptive background is the solid midnight color `#0F0B1F`. The dedicated
`adaptive-monochrome.png` white alpha mask is configured as `monochromeImage` for
Android 13+ launchers with themed icons enabled. Native launcher
masks and splash placement are controlled by the OS and still need device review.
The icon source has square corners; the OS applies its own mask.

## Re-export and validation

```sh
pnpm --filter @ghosttag/mobile brand:export
pnpm --filter @ghosttag/mobile brand:check
```

The exporter uses the installed Expo SDK's image utilities for deterministic PNG
sizing, transparency and padding. It does not regenerate artwork or call an image
API, and adds no runtime imaging dependency. Keep all masters when updating the
SDK; the export script relies on the SDK's image tooling. Checks verify export
dimensions, full opacity of the iOS icon, and transparent Android foreground
margins, white-only monochrome pixels, transparent splash edges, source-export
pixel consistency, and the solid foreground inside Android's 66/108 safe circle
(see [Android adaptive icon guidance](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)). Rebuild/reinstall native binaries after changing app icons or splash
configuration. Expo Go does not replace its own launcher icon with this asset.

Palette: violet `#8B5CF6`, pink `#EC4899`, cyan `#22D3EE`, lavender `#A78BFA`,
midnight `#0F0B1F`. The new visual components are in `src/ui/brand.tsx`; existing
room/chat logic and backend contracts are unchanged. No new room vibe, voting,
settings, or scanner feature is implied by the reference UI.

## Artwork generation record

Mode: built-in `image_gen` tool, using the approved board as the mascot reference
and the approved mascot master as the icon reference. No API-key/CLI fallback was
used. Generated masters are saved in this directory; the application does not
reference the tool's external output directory. Discarded monochrome experiments
are not included.

Final mascot prompt:

```text
Use case: logo-brand. Asset type: production transparent mascot master for the GhostTag mobile application, its splash and Android adaptive foreground. Input image 1 is a STYLE AND CHARACTER REFERENCE, not a target to reproduce as a board. Create ONLY the single floating ghost mascot shown in the large upper-left reference: glossy pearly white and lavender rounded friendly ghost, two large dark navy oval eyes, no mouth, little lifted left arm, softly scalloped lower body, floating at a slight diagonal, luminous violet and hot pink on upper/left edge and icy cyan-blue light on lower/right edge. Include the thin magenta/violet/cyan orbital swoosh wrapping behind and in front of it, and just three small violet/cyan four-point sparkles around it. Match the supplied mascot faithfully. Center the complete mascot/orbit/sparkles within the central 60% of a square 1024x1024 canvas; ample fully transparent padding on all sides so nothing is cropped by Android circular icon masks. Polished soft 3D iridescent illustration, crisp silhouette legible at small sizes, restrained edge glow. Absolutely no text, no letters, no logos other than the ghost itself, no UI, no phones, no panels, no background, no checkerboard pixels. Genuine alpha transparency. One single asset only, not a presentation sheet.
```

Final opaque icon prompt:

```text
Use case: logo-brand. Asset type: square GhostTag application icon source, one single icon. Input image is the approved mascot: preserve its exact character design, iridescent white/lavender body, two dark blue oval eyes, violet/pink/cyan orbital ring and three four-point sparkles. Place it centered on an OPAQUE very dark midnight violet background #0F0B1F, with an extremely subtle soft violet halo behind the ghost. The ghost and all sparkles should occupy only the central 65 percent of the full square, with generous dark margins around all sides. Important: fill the entire square with the dark background, NO rounded outer corners, no border, no frame, no words or letters, no mockups, no app icon presentation sheet, no checkerboard, no transparency. It will be masked by iOS and Android, so provide full square artwork. Match the reference mascot faithfully; just create this clean app icon composition. Aim for a square 1024x1024 production asset.
```

Requested generation dimensions are guidance; `brand:export` normalizes the
actual masters to the platform sizes above and preserves the transparent mascot's
alpha channel. Pixel checks and web previews do not constitute native-device
visual verification.

## Monochrome export and native splash

Mode: built-in `image_gen`, new stencil generation based on the existing mascot's
ghost/eyes/arm/scalloped-base/orbit design. No CLI/API-key fallback. Transparent
generation experiments had noisy contours and were discarded; the accepted
black/white master is converted deterministically to the final transparent layer.
Final prompt:

```text
Use case: logo-brand. Production GhostTag monochrome icon master. Pure opaque BLACK square background, pure WHITE flat graphic, sharp clean vector-style curves. One friendly white ghost with rounded head, two large BLACK oval eyes (negative space), raised left arm, softly scalloped lower edge, and one tilted Saturn orbital ring wrapping around body with BLACK gaps separating ring from body. Preserve GhostTag ghost-and-orbit concept. Center within middle 60 percent of square canvas, lots of black padding. NO stars, NO texture, NO gray, NO transparency, NO gradients, NO shadows, NO glowing, NO noise, NO 3D, NO text, NO border. Clean two-color stencil. Entire ghost and ring in white, eyes and gaps solid black. Crisp professional logo.
```

The monochrome stencil is a dedicated simplified ghost-and-orbit drawing, not the
full-color icon used as an Android monochrome layer. Its oval eyes and orbital-ring
gaps become transparent negative space. `brand:export` thresholds the black/white
master into a hard white alpha mask, crops transparent padding, and scales the
artwork into a centered 300px radius before antialiasing. All visible output pixels
have RGB 255/255/255; partial alpha is confined to resampled contour edges. The
entire visible mask remains inside Android's 66/108 safe circle. The opaque black
master is only a reproducible export input and is not configured as an app icon.
Full-color transparent exports also discard alpha values of 1/255 introduced by
the source/export pipeline, so their outer canvas edges are fully transparent.

The splash uses the existing transparent mascot at a 200-point image width with
`resizeMode: contain`; full-screen stretching is disabled. Expo's Android plugin
uses center gravity and the iOS storyboard uses centered aspect-fit constraints.
The app is fixed to dark appearance: the base midnight background and mascot apply
in both system appearance modes; no separate, conflicting dark override is needed.
Keep native screenshot review pending until a standalone preview build is installed.
Expo Go and development builds do not fully reproduce standalone splash behavior;
see [Expo splash documentation](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/).

See [native branding verification](../../../../docs/operations/native-branding.md)
for development/preview builds and the launcher/splash checklist.
