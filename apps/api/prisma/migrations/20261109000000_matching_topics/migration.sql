ALTER TABLE "match_searches" ADD COLUMN "topic" VARCHAR(32) NOT NULL DEFAULT 'open';
ALTER TABLE "match_searches" ADD CONSTRAINT "match_searches_topic_check"
  CHECK ("topic" IN ('open', 'music', 'games', 'deep-talk'));
CREATE INDEX "match_searches_topic_createdAt_idx" ON "match_searches"("topic", "createdAt");
