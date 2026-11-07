-- CreateTable
CREATE TABLE "InterviewDelivery" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "visualCapability" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
    "visualSamples" INTEGER NOT NULL DEFAULT 0,
    "visualDurationMs" INTEGER NOT NULL DEFAULT 0,
    "faceVisibleRatio" DOUBLE PRECISION,
    "cameraEngagementRatio" DOUBLE PRECISION,
    "engagementBand" TEXT,
    "framingBand" TEXT,
    "lightingBand" TEXT,
    "stabilityBand" TEXT,
    "visualObservations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visualLimitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "speakingTurns" INTEGER NOT NULL DEFAULT 0,
    "spokenWords" INTEGER NOT NULL DEFAULT 0,
    "totalSpeakingMs" INTEGER NOT NULL DEFAULT 0,
    "wordsPerMinute" INTEGER,
    "paceBand" TEXT,
    "fillers" JSONB NOT NULL DEFAULT '[]',
    "fillersPerHundred" DOUBLE PRECISION,
    "longPauses" INTEGER NOT NULL DEFAULT 0,
    "meanAnswerWords" INTEGER,
    "shortAnswers" INTEGER NOT NULL DEFAULT 0,
    "selfCorrections" INTEGER NOT NULL DEFAULT 0,
    "paceEarlyWpm" INTEGER,
    "paceLateWpm" INTEGER,
    "speechObservations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "speechLimitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interruptions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewDelivery_interviewId_key" ON "InterviewDelivery"("interviewId");

-- AddForeignKey
ALTER TABLE "InterviewDelivery" ADD CONSTRAINT "InterviewDelivery_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
