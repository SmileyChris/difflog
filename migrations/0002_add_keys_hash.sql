-- Add keys_hash column for tracking encrypted API key + provider selection changes
ALTER TABLE profiles ADD COLUMN keys_hash TEXT;
