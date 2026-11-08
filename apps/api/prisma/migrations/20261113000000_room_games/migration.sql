CREATE TABLE "room_games" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "publicId" VARCHAR(34) NOT NULL DEFAULT ('g_'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)),
    "roomId" UUID NOT NULL,
    "startedByMembershipId" UUID NOT NULL,
    "clientGameId" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMPTZ(6) NOT NULL,
    "lastActionAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(6),
    CONSTRAINT "room_games_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_games_kind_check" CHECK ("kind" IN ('RPS', 'ANTAKSHARI'))
);
CREATE UNIQUE INDEX "room_games_publicId_key" ON "room_games"("publicId");
CREATE UNIQUE INDEX "room_games_roomId_startedByMembershipId_clientGameId_key" ON "room_games"("roomId", "startedByMembershipId", "clientGameId");
CREATE INDEX "room_games_roomId_createdAt_idx" ON "room_games"("roomId", "createdAt" DESC);
ALTER TABLE "room_games" ADD CONSTRAINT "room_games_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_games" ADD CONSTRAINT "room_games_startedByMembershipId_fkey" FOREIGN KEY ("startedByMembershipId") REFERENCES "room_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "game_choices" (
    "gameId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "choice" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "game_choices_pkey" PRIMARY KEY ("gameId", "membershipId"),
    CONSTRAINT "game_choices_choice_check" CHECK ("choice" IN ('ROCK', 'PAPER', 'SCISSORS'))
);
ALTER TABLE "game_choices" ADD CONSTRAINT "game_choices_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "room_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_choices" ADD CONSTRAINT "game_choices_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "room_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "game_turns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gameId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "clientTurnId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "nextCue" VARCHAR(12) NOT NULL,
    "messageId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "game_turns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_turns_sequence_check" CHECK ("sequence" > 0)
);
CREATE UNIQUE INDEX "game_turns_messageId_key" ON "game_turns"("messageId");
CREATE UNIQUE INDEX "game_turns_gameId_membershipId_clientTurnId_key" ON "game_turns"("gameId", "membershipId", "clientTurnId");
CREATE UNIQUE INDEX "game_turns_gameId_sequence_key" ON "game_turns"("gameId", "sequence");
CREATE INDEX "game_turns_gameId_createdAt_idx" ON "game_turns"("gameId", "createdAt");
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "room_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "room_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
