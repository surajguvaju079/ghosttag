ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'LIKE';
ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'LOVE';
ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'SAD';
ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'ANGRY';

-- Keep the most recent reaction when an existing member chose multiple types.
DELETE FROM "reactions" AS reaction
USING (
  SELECT "id", row_number() OVER (
    PARTITION BY "messageId", "membershipId"
    ORDER BY "createdAt" DESC, "id" DESC
  ) AS position
  FROM "reactions"
) AS ranked
WHERE reaction."id" = ranked."id" AND ranked.position > 1;

DROP INDEX "reactions_messageId_membershipId_type_key";
CREATE UNIQUE INDEX "reactions_messageId_membershipId_key"
ON "reactions"("messageId", "membershipId");
