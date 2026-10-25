ALTER TABLE "message_reports"
  DROP CONSTRAINT "message_reports_reason_check";

ALTER TABLE "message_reports"
  ADD CONSTRAINT "message_reports_reason_check"
  CHECK ("reason" IN ('SPAM', 'HARASSMENT', 'HATE', 'SEXUAL_CONTENT', 'THREAT', 'CHILD_SAFETY', 'OTHER'));
