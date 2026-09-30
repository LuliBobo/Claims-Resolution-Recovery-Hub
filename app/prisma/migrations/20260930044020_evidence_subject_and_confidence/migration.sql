-- CreateEnum
CREATE TYPE "PhotoSubject" AS ENUM ('item', 'outer_carton', 'other');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "photoSubject" "PhotoSubject";
