ALTER TABLE sources ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
