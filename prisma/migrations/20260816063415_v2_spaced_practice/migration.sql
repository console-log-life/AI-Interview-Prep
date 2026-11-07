-- CreateEnum
CREATE TYPE "ReviewItemKind" AS ENUM ('MISTAKE', 'SKILL');

-- CreateEnum
CREATE TYPE "ReviewQuality" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReviewItemKind" NOT NULL,
    "refKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "mistakeId" TEXT,
    "skillKey" TEXT,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "lastQuality" "ReviewQuality",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "reviewItemId" TEXT NOT NULL,
    "quality" "ReviewQuality" NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "ease" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_mistakeId_key" ON "ReviewItem"("mistakeId");

-- CreateIndex
CREATE INDEX "ReviewItem_userId_isActive_dueAt_idx" ON "ReviewItem"("userId", "isActive", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_userId_kind_refKey_key" ON "ReviewItem"("userId", "kind", "refKey");

-- CreateIndex
CREATE INDEX "ReviewLog_reviewItemId_createdAt_idx" ON "ReviewLog"("reviewItemId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_reviewItemId_fkey" FOREIGN KEY ("reviewItemId") REFERENCES "ReviewItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
