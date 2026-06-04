-- Add author_name display field to challenges.
ALTER TABLE ctf_challenges ADD COLUMN IF NOT EXISTS author_name CHARACTER VARYING(255);
