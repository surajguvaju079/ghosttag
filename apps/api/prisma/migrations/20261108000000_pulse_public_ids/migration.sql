ALTER TABLE "polls" ADD COLUMN "publicId" VARCHAR(34) NOT NULL DEFAULT ('u_' || replace(gen_random_uuid()::text, '-', ''));
ALTER TABLE "polls" ADD COLUMN "promptId" VARCHAR(60);
CREATE UNIQUE INDEX "polls_publicId_key" ON "polls"("publicId");
