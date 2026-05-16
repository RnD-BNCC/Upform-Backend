ALTER TABLE "PollSlide"
  ADD COLUMN IF NOT EXISTS "stsrc" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "PollVote"
  ADD COLUMN IF NOT EXISTS "stsrc" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "Question"
  ADD COLUMN IF NOT EXISTS "stsrc" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "QuestionLike"
  ADD COLUMN IF NOT EXISTS "stsrc" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PollSlide_pollId_stsrc_idx" ON "PollSlide"("pollId", "stsrc");
CREATE INDEX IF NOT EXISTS "PollVote_slideId_stsrc_idx" ON "PollVote"("slideId", "stsrc");
CREATE INDEX IF NOT EXISTS "Question_pollId_stsrc_idx" ON "Question"("pollId", "stsrc");
CREATE INDEX IF NOT EXISTS "QuestionLike_questionId_stsrc_idx" ON "QuestionLike"("questionId", "stsrc");
