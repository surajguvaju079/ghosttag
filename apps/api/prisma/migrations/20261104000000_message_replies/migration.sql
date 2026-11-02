ALTER TABLE "messages" ADD COLUMN "replyToId" UUID;
CREATE INDEX "messages_replyToId_idx" ON "messages"("replyToId");
ALTER TABLE "messages" ADD CONSTRAINT "messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
