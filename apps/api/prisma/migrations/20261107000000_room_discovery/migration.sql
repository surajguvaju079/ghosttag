ALTER TABLE "rooms" ADD COLUMN "discoverable" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "rooms_discoverable_createdAt_inviteId_idx" ON "rooms" ("discoverable", "createdAt" DESC, "inviteId" DESC);
