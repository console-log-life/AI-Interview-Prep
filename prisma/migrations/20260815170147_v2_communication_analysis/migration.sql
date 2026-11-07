-- CreateTable
CREATE TABLE "CommunicationAnalysis" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "clarity" INTEGER NOT NULL,
    "structure" INTEGER NOT NULL,
    "conciseness" INTEGER NOT NULL,
    "technicalExplanation" INTEGER NOT NULL,
    "starSituation" BOOLEAN NOT NULL DEFAULT false,
    "starTask" BOOLEAN NOT NULL DEFAULT false,
    "starAction" BOOLEAN NOT NULL DEFAULT false,
    "starResult" BOOLEAN NOT NULL DEFAULT false,
    "isBehavioural" BOOLEAN NOT NULL DEFAULT false,
    "observations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coaching" TEXT NOT NULL,
    "modelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationAnalysis_evaluationId_key" ON "CommunicationAnalysis"("evaluationId");

-- CreateIndex
CREATE INDEX "CommunicationAnalysis_interviewId_idx" ON "CommunicationAnalysis"("interviewId");

-- AddForeignKey
ALTER TABLE "CommunicationAnalysis" ADD CONSTRAINT "CommunicationAnalysis_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "InterviewEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationAnalysis" ADD CONSTRAINT "CommunicationAnalysis_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
