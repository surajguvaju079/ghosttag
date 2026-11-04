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
