/*
  Warnings:

  - The values [LOCKED] on the enum `RoomStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "RoomMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "RoomMembershipStatus" AS ENUM ('ACTIVE', 'LEFT');

-- AlterEnum
BEGIN;
CREATE TYPE "RoomStatus_new" AS ENUM ('ACTIVE', 'EXPIRED');
ALTER TABLE "public"."rooms" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "rooms" ALTER COLUMN "status" TYPE "RoomStatus_new" USING ("status"::text::"RoomStatus_new");
ALTER TYPE "RoomStatus" RENAME TO "RoomStatus_old";
ALTER TYPE "RoomStatus_new" RENAME TO "RoomStatus";
DROP TYPE "public"."RoomStatus_old";
ALTER TABLE "rooms" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "room_memberships" ADD COLUMN     "leftAt" TIMESTAMPTZ(6),
ADD COLUMN     "role" "RoomMemberRole" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "status" "RoomMembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "lockedUntil" TIMESTAMPTZ(6);
