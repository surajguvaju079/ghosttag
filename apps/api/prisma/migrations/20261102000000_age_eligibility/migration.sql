CREATE TYPE "AgeEligibilityResult" AS ENUM ('ELIGIBLE', 'INELIGIBLE');
CREATE TYPE "AgeAssessmentMethod" AS ENUM ('DECLARED_DOB');

CREATE TABLE "age_eligibility" (
  "userId" UUID NOT NULL,
  "result" "AgeEligibilityResult" NOT NULL,
  "method" "AgeAssessmentMethod" NOT NULL DEFAULT 'DECLARED_DOB',
  "assessedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "policyVersion" VARCHAR(80) NOT NULL,
  CONSTRAINT "age_eligibility_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "age_eligibility_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "anonymous_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
