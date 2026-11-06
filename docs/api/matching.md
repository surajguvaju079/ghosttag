# Matching topic addition

`POST /api/v1/matching/search` still requires `{ "language": "en" }` and now
accepts an optional `topic`: `open`, `music`, `games`, or `deep-talk`. Omitted
topic means `open` for older clients. Unknown fields or topics return
`400 INVALID_MATCH_SEARCH`.

The `search` object in matching state, start, heartbeat, and cancel responses
includes `topic`. While a search is active, a repeated start returns that search
with its original topic; changing topics requires cancelling and starting again.
Candidates must have the same topic. Search and room lifetimes, block checks,
eligibility, and rate limits are unchanged.

The `session` object also includes the chosen `topic`. Existing sessions are
backfilled as `open`; newly paired sessions retain their search topic until the
temporary room is removed.
