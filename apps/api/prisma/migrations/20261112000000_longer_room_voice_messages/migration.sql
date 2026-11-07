ALTER TABLE "voice_clips"
DROP CONSTRAINT "voice_clips_duration_check",
DROP CONSTRAINT "voice_clips_size_check";

ALTER TABLE "voice_clips"
ADD CONSTRAINT "voice_clips_duration_check" CHECK ("durationMs" > 0),
ADD CONSTRAINT "voice_clips_size_check" CHECK ("byteLength" BETWEEN 1 AND 5242880 AND octet_length("data") = "byteLength");
