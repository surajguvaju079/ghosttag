# GhostTag native voice lab

This is a separate internal Expo app. Its microphone permission and audio
dependency are not included in the production GhostTag mobile app. Install
workspace dependencies, then run `pnpm --filter @ghosttag/voice-lab android`
or `pnpm --filter @ghosttag/voice-lab ios` to make a native development build.
Expo Go cannot load this native audio module.

Record up to ten seconds, stop, preview the locally altered WAV, then discard.
The original recording is deleted after transformation or on failure. Leaving
the app discards the current sample. There is no network or upload code.

This speed and filter transform is **only a technical baseline**. It is not a
speaker anonymizer and must not be shipped as an anonymity feature. Test
recognition against originals across diverse voices, devices and accents,
intelligibility, microphone denial, interruption and background cleanup.
Production media storage, reporting, retention and chat contracts remain gated
on that review.

## Native acceptance check

Run on an Android device and an iPhone before treating the lab as working on
both platforms. This workspace has no connected device, so a successful TypeScript
check and Expo bundle export only verify the JavaScript path.

1. Deny microphone access, then allow it in system settings. Recording should
   fail clearly while denied and work after permission is granted.
2. Record a short sentence. Stop manually and repeat with the ten-second timeout.
   Confirm that only the altered preview is playable and that repeated Play taps
   restart playback instead of layering audio.
3. Discard while recording, while processing, and while previewing. Repeat by
   backgrounding the app. No audio should resume on return.
4. Interrupt recording with a phone call or another audio app. The lab should
   recover to a usable state, and its temporary files should be removed.
5. Compare original and altered samples with listeners who know the speaker.
   Record recognition and speech intelligibility results before considering a
   production voice feature.
