-- Cited strengths and weaknesses for the interview report.
--
-- Additive and defaulted: every existing report keeps working and renders its
-- strengths and weaknesses as a plain uncited list.
ALTER TABLE "InterviewReport" ADD COLUMN     "evidence" JSONB NOT NULL DEFAULT '[]';
