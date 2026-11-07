-- Per-dimension justifications for the answer rubric.
--
-- Additive and defaulted: existing evaluations keep their scores and render
-- without justifications.
ALTER TABLE "InterviewEvaluation" ADD COLUMN     "rubricNotes" JSONB NOT NULL DEFAULT '{}';
