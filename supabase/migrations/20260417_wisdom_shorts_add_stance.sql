-- Adds the `stance` column to wisdom_shorts (ff_new_minds_system).
--
-- stance values:
--   'comforting'  — meets the reader in the feeling, offers gentleness
--   'clarifying'  — names / gives language to the feeling
--   'disruptive'  — interrupts the pattern, turns the question back
--
-- Existing rows default to 'clarifying' until retagged by a batch job.
-- Client code also defaults missing values to 'clarifying' on read, so the
-- migration is safe to roll out before clients pick up the new column.

ALTER TABLE wisdom_shorts
  ADD COLUMN IF NOT EXISTS stance text
  CHECK (stance IN ('comforting', 'clarifying', 'disruptive'))
  DEFAULT 'clarifying';

-- Backfill any rows that predated the DEFAULT clause.
UPDATE wisdom_shorts SET stance = 'clarifying' WHERE stance IS NULL;
