# Replies and reactions

Approved message additions use existing room membership authorization and room
expiry. A reply references one existing message in the same room; the server
returns the target's public ID, text and room-scoped author in `replyTo`. A missing
or cross-room target is rejected. A retry key is bound to both text and target.
The reply reference is stored with the message and disappears with room cleanup.

Reactions use the existing FIRE, LAUGH, SHOCK and MIND_BLOWN types and the existing
unique `(messageId, membershipId, type)` row. Each type toggles independently.
History includes counts and whether the requesting membership reacted. Reaction
changes broadcast a public message ID and type/count; recipient-specific `mine`
is computed under room authorization. Reconnect/history is authoritative. Neither
interaction reveals internal IDs or creates a durable social graph.
