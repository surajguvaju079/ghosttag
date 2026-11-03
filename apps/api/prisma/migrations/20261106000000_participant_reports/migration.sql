CREATE TABLE "participant_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "roomId" UUID NOT NULL,
  "reporterMembershipId" UUID NOT NULL,
  "targetMembershipId" UUID NOT NULL,
  "reason" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "participant_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "participant_reports_distinct_members" CHECK ("reporterMembershipId" <> "targetMembershipId"),
  CONSTRAINT "participant_reports_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "participant_reports_reporterMembershipId_fkey" FOREIGN KEY ("reporterMembershipId") REFERENCES "room_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "participant_reports_targetMembershipId_fkey" FOREIGN KEY ("targetMembershipId") REFERENCES "room_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "participant_reports_roomId_reporterMembershipId_targetMembershipId_key" ON "participant_reports"("roomId", "reporterMembershipId", "targetMembershipId");
CREATE INDEX "participant_reports_createdAt_idx" ON "participant_reports"("createdAt");

-- Existing matching blocks acquire the same group-room separation rule.
UPDATE "room_memberships" mine
SET "status" = 'LEFT', "leftAt" = CURRENT_TIMESTAMP
FROM "match_blocks" block, "room_memberships" theirs, "rooms" room
WHERE block."blockerId" = mine."userId"
  AND block."blockedId" = theirs."userId"
  AND mine."roomId" = theirs."roomId"
  AND mine."roomId" = room."id"
  AND mine."status" = 'ACTIVE'
  AND theirs."status" = 'ACTIVE'
  AND room."kind" = 'GROUP'
  AND room."status" = 'ACTIVE'
  AND room."expiresAt" > CURRENT_TIMESTAMP;
