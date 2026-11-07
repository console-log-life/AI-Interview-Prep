-- CreateEnum
CREATE TYPE "CognitiveLevel" AS ENUM ('RECALL', 'UNDERSTAND', 'APPLY', 'ANALYSE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('INTERVIEW', 'ASSESSMENT', 'CODING', 'RESUME');

-- CreateEnum
CREATE TYPE "MistakeStatus" AS ENUM ('ACTIVE', 'IMPROVING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MistakeSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'PARTIAL', 'UNCLEAR', 'WEAK');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('ASSESSMENT', 'INTERVIEW', 'CODING', 'STUDY', 'RESUME', 'REVIEW');

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "cognitiveLevel" "CognitiveLevel" NOT NULL DEFAULT 'UNDERSTAND',
ADD COLUMN     "dedupeHash" TEXT,
ADD COLUMN     "estimatedTimeSec" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qualityScore" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "skillKey" TEXT,
ADD COLUMN     "subtopic" TEXT;

-- CreateTable
CREATE TABLE "SkillNode" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "parentKey" TEXT,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observations" INTEGER NOT NULL DEFAULT 0,
    "lastPracticedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mistake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "skillKey" TEXT,
    "severity" "MistakeSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "MistakeStatus" NOT NULL DEFAULT 'ACTIVE',
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mistake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MistakeOccurrence" (
    "id" TEXT NOT NULL,
    "mistakeId" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MistakeOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewState" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "currentDifficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "followUpDepth" INTEGER NOT NULL DEFAULT 0,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "coveredTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "masteredTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "strugglingTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skillEstimate" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "streakStrong" INTEGER NOT NULL DEFAULT 0,
    "streakWeak" INTEGER NOT NULL DEFAULT 0,
    "pendingProbes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeClaim" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "probes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ClaimStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidence" TEXT,
    "understanding" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "targetRole" TEXT,
    "jobDescriptionId" TEXT,
    "summary" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapTask" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "kind" "TaskKind" NOT NULL,
    "topic" TEXT,
    "skillKey" TEXT,
    "estimatedMin" INTEGER NOT NULL DEFAULT 30,
    "actionUrl" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoadmapTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlanTask" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "kind" "TaskKind" NOT NULL,
    "topic" TEXT,
    "skillKey" TEXT,
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "actionUrl" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyPlanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "grounding" JSONB,
    "suggestedTasks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "correctness" INTEGER NOT NULL,
    "timeComplexity" TEXT NOT NULL,
    "spaceComplexity" TEXT NOT NULL,
    "readability" INTEGER NOT NULL,
    "maintainability" INTEGER NOT NULL,
    "efficiency" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "edgeCases" JSONB NOT NULL DEFAULT '[]',
    "optimizationNotes" TEXT,
    "optimizedApproach" TEXT,
    "learningPoints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "validationOk" BOOLEAN NOT NULL DEFAULT true,
    "errorCategory" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkillNode_key_key" ON "SkillNode"("key");

-- CreateIndex
CREATE INDEX "SkillNode_category_idx" ON "SkillNode"("category");

-- CreateIndex
CREATE INDEX "SkillNode_parentKey_idx" ON "SkillNode"("parentKey");

-- CreateIndex
CREATE INDEX "SkillObservation_userId_skillKey_observedAt_idx" ON "SkillObservation"("userId", "skillKey", "observedAt");

-- CreateIndex
CREATE INDEX "SkillObservation_userId_observedAt_idx" ON "SkillObservation"("userId", "observedAt");

-- CreateIndex
CREATE INDEX "SkillObservation_sourceId_idx" ON "SkillObservation"("sourceId");

-- CreateIndex
CREATE INDEX "SkillProfile_userId_score_idx" ON "SkillProfile"("userId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "SkillProfile_userId_skillKey_key" ON "SkillProfile"("userId", "skillKey");

-- CreateIndex
CREATE INDEX "Mistake_userId_status_frequency_idx" ON "Mistake"("userId", "status", "frequency");

-- CreateIndex
CREATE UNIQUE INDEX "Mistake_userId_concept_key" ON "Mistake"("userId", "concept");

-- CreateIndex
CREATE INDEX "MistakeOccurrence_mistakeId_createdAt_idx" ON "MistakeOccurrence"("mistakeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewState_interviewId_key" ON "InterviewState"("interviewId");

-- CreateIndex
CREATE INDEX "ResumeClaim_resumeId_status_idx" ON "ResumeClaim"("resumeId", "status");

-- CreateIndex
CREATE INDEX "Roadmap_userId_isActive_createdAt_idx" ON "Roadmap"("userId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "RoadmapTask_roadmapId_day_idx" ON "RoadmapTask"("roadmapId", "day");

-- CreateIndex
CREATE INDEX "DailyPlan_userId_day_idx" ON "DailyPlan"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPlan_userId_day_key" ON "DailyPlan"("userId", "day");

-- CreateIndex
CREATE INDEX "DailyPlanTask_planId_idx" ON "DailyPlanTask"("planId");

-- CreateIndex
CREATE INDEX "CoachConversation_userId_updatedAt_idx" ON "CoachConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "CoachMessage_conversationId_createdAt_idx" ON "CoachMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodeReview_submissionId_key" ON "CodeReview"("submissionId");

-- CreateIndex
CREATE INDEX "AIUsageLog_createdAt_idx" ON "AIUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AIUsageLog_feature_createdAt_idx" ON "AIUsageLog"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageLog_userId_createdAt_idx" ON "AIUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Question_reviewStatus_idx" ON "Question"("reviewStatus");

-- CreateIndex
CREATE INDEX "Question_dedupeHash_idx" ON "Question"("dedupeHash");

-- CreateIndex
CREATE INDEX "Question_skillKey_idx" ON "Question"("skillKey");

-- AddForeignKey
ALTER TABLE "SkillNode" ADD CONSTRAINT "SkillNode_parentKey_fkey" FOREIGN KEY ("parentKey") REFERENCES "SkillNode"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillObservation" ADD CONSTRAINT "SkillObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillObservation" ADD CONSTRAINT "SkillObservation_skillKey_fkey" FOREIGN KEY ("skillKey") REFERENCES "SkillNode"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillProfile" ADD CONSTRAINT "SkillProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mistake" ADD CONSTRAINT "Mistake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MistakeOccurrence" ADD CONSTRAINT "MistakeOccurrence_mistakeId_fkey" FOREIGN KEY ("mistakeId") REFERENCES "Mistake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewState" ADD CONSTRAINT "InterviewState_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeClaim" ADD CONSTRAINT "ResumeClaim_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapTask" ADD CONSTRAINT "RoadmapTask_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlan" ADD CONSTRAINT "DailyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlanTask" ADD CONSTRAINT "DailyPlanTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DailyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachConversation" ADD CONSTRAINT "CoachConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CoachConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeReview" ADD CONSTRAINT "CodeReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CodingSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageLog" ADD CONSTRAINT "AIUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
