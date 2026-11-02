# Replies and reactions

Approved message additions use existing room membership authorization and room
expiry. A reply references one existing message in the same room; the server
returns the target's public ID, text and room-scoped author in `replyTo`. A missing
or cross-room target is rejected. A retry key is bound to both text and target.
The reply reference is stored with the message and disappears with room cleanup.

Reactions use FIRE, LAUGH, SHOCK, MIND_BLOWN, LIKE, LOVE, SAD and ANGRY. The unique
`(messageId, membershipId)` row allows one reaction per member on a message.
Tapping the current type removes it; choosing another replaces it. Migration
retains the newest reaction for members who previously chose multiple types.
History includes counts and whether the requesting membership reacted. Reaction
changes broadcast a public message ID and the complete reaction summary;
recipient-specific `mine` is computed under room authorization. Reconnect/history is authoritative. Neither
interaction reveals internal IDs or creates a durable social graph.
