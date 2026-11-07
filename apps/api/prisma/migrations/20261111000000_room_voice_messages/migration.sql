CREATE TABLE "voice_clips" (
    "messageId" UUID NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "voice_clips_pkey" PRIMARY KEY ("messageId"),
    CONSTRAINT "voice_clips_duration_check" CHECK ("durationMs" BETWEEN 1 AND 10000),
    CONSTRAINT "voice_clips_size_check" CHECK ("byteLength" BETWEEN 1 AND 262144 AND octet_length("data") = "byteLength")
);

ALTER TABLE "voice_clips"
ADD CONSTRAINT "voice_clips_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
