ALTER TABLE vector_entries
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_vector_entries_metadata_gin
ON vector_entries
USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_vector_entries_project_id
ON vector_entries ((metadata->>'project_id'));

CREATE INDEX IF NOT EXISTS idx_vector_entries_capsule_id
ON vector_entries ((metadata->>'capsule_id'));

CREATE INDEX IF NOT EXISTS idx_vector_entries_task_id
ON vector_entries ((metadata->>'task_id'));
