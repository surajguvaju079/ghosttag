-- Random public identifiers are independent of all existing internal UUIDs.
ALTER TABLE "room_memberships" ADD COLUMN "publicId" VARCHAR(34) NOT NULL
  DEFAULT ('p_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text));
CREATE UNIQUE INDEX "room_memberships_publicId_key" ON "room_memberships"("publicId");
ALTER TABLE "messages" ADD COLUMN "publicId" VARCHAR(34) NOT NULL
  DEFAULT ('m_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)),
  ADD COLUMN "clientMessageId" VARCHAR(36);
CREATE UNIQUE INDEX "messages_publicId_key" ON "messages"("publicId");
CREATE UNIQUE INDEX "messages_membershipId_clientMessageId_key"
  ON "messages"("membershipId", "clientMessageId");
CREATE INDEX "messages_roomId_createdAt_publicId_idx" ON "messages"("roomId", "createdAt", "publicId");
