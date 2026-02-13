-- Add password_salt column to store client-side salt separately
-- Previously extracted by parsing password_hash, but v2 format changes that
ALTER TABLE profiles ADD COLUMN password_salt TEXT;
