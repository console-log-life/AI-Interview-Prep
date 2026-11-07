-- Attention feedback aggregates for the live interview.
--
-- Additive and defaulted, so every existing delivery row stays valid and reads
-- back as "not measured" rather than as a zeroed set of findings.
--
-- Aggregates only: ratios and counts. No frame, image or landmark is stored.
ALTER TABLE "InterviewDelivery" ADD COLUMN     "attention" JSONB NOT NULL DEFAULT '{}';
