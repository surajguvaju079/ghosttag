CREATE INDEX "rooms_expiresAt_id_idx" ON "rooms"("expiresAt", "id");
CREATE TABLE "message_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL,
  "reporterMembershipId" UUID NOT NULL,
  "reason" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_reports_reason_check" CHECK ("reason" IN ('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL_CONTENT', 'THREAT', 'OTHER')),
  CONSTRAINT "message_reports_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_reports_reporterMembershipId_fkey" FOREIGN KEY ("reporterMembershipId") REFERENCES "room_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "message_reports_messageId_reporterMembershipId_key" ON "message_reports"("messageId", "reporterMembershipId");
CREATE INDEX "message_reports_reporterMembershipId_idx" ON "message_reports"("reporterMembershipId");
