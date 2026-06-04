-- SSH credential fields for SSH-protocol challenges.
ALTER TABLE ctf_challenges ADD COLUMN IF NOT EXISTS ssh_username CHARACTER VARYING(100);
ALTER TABLE ctf_challenges ADD COLUMN IF NOT EXISTS ssh_password CHARACTER VARYING(100);

-- Widen category constraint to include LINUX.
ALTER TABLE ctf_challenges DROP CONSTRAINT IF EXISTS ctf_challenges_category_check;
ALTER TABLE ctf_challenges ADD CONSTRAINT ctf_challenges_category_check
    CHECK (category = ANY (ARRAY['CRYPTO','FORENSICS','REVERSE','WEB','MISC','OSINT','PWN','LINUX']));
