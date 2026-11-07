-- AlterTable
ALTER TABLE "InterviewMessage" ADD COLUMN     "probeClaimId" TEXT;

-- CreateIndex
CREATE INDEX "InterviewMessage_probeClaimId_idx" ON "InterviewMessage"("probeClaimId");

-- AddForeignKey
ALTER TABLE "InterviewMessage" ADD CONSTRAINT "InterviewMessage_probeClaimId_fkey" FOREIGN KEY ("probeClaimId") REFERENCES "ResumeClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
