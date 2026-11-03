# Altered voice research prototype

Serve this directory from `localhost` or HTTPS (microphone APIs require a secure
context), then open `index.html` on a test phone. This is a browser-only local
prototype; it is not connected to GhostTag chat and changes no production mobile
permissions. It records at most ten seconds, transforms the recording on the
device, plays the altered result, and exposes no upload or persistence route.

The current speed/tone filter is a feasibility baseline, **not a proven speaker
anonymizer**. Before building native messaging, compare recognition of original
and transformed samples across varied speakers and devices, check intelligibility,
and review results with the product owner. Do not ship a privacy claim or media
storage contract until that review passes. A native mobile implementation will
need a supported local audio-processing path and a fresh release build.
