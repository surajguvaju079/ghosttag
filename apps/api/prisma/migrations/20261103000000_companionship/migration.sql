CREATE TYPE "RoomKind" AS ENUM ('GROUP', 'MATCHED');
ALTER TABLE "rooms" ADD COLUMN "kind" "RoomKind" NOT NULL DEFAULT 'GROUP', ADD COLUMN "inviteId" UUID;
UPDATE "rooms" SET "inviteId" = gen_random_uuid();
CREATE UNIQUE INDEX "rooms_inviteId_key" ON "rooms"("inviteId");
CREATE TABLE "match_searches" (
 "userId" UUID PRIMARY KEY REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "publicId" VARCHAR(34) NOT NULL UNIQUE DEFAULT ('s_' || replace(gen_random_uuid()::text, '-', '')),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL, "leaseUntil" TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX "match_searches_expiresAt_idx" ON "match_searches"("expiresAt");
CREATE INDEX "match_searches_leaseUntil_idx" ON "match_searches"("leaseUntil");
CREATE TABLE "match_sessions" (
 "roomId" UUID PRIMARY KEY REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "publicId" VARCHAR(34) NOT NULL UNIQUE DEFAULT ('c_' || replace(gen_random_uuid()::text, '-', '')),
 "userAId" UUID NOT NULL REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userBId" UUID NOT NULL REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "extended" BOOLEAN NOT NULL DEFAULT false, "voteA" BOOLEAN NOT NULL DEFAULT false, "voteB" BOOLEAN NOT NULL DEFAULT false,
 CONSTRAINT "match_distinct_parties" CHECK ("userAId" <> "userBId")
);
CREATE INDEX "match_sessions_userAId_idx" ON "match_sessions"("userAId");
CREATE INDEX "match_sessions_userBId_idx" ON "match_sessions"("userBId");
CREATE TABLE "match_blocks" (
 "blockerId" UUID NOT NULL REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "blockedId" UUID NOT NULL REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("blockerId", "blockedId"), CHECK ("blockerId" <> "blockedId")
);
CREATE INDEX "match_blocks_blockedId_idx" ON "match_blocks"("blockedId");
