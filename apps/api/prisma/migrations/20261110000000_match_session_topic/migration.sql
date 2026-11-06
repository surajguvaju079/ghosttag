ALTER TABLE "match_sessions" ADD COLUMN "topic" VARCHAR(32) NOT NULL DEFAULT 'open';
ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_topic_check"
  CHECK ("topic" IN ('open', 'music', 'games', 'deep-talk'));
