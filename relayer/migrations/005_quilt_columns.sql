-- Quilt-based storage: one Walrus Blob object holds many facts as patches.
-- Existing rows remain storage_kind='blob' and keep their blob_id.
-- New batch-ingested rows use storage_kind='quilt' with quilt_id + quilt_patch_id.

ALTER TABLE vector_entries
    ADD COLUMN IF NOT EXISTS quilt_id TEXT,
    ADD COLUMN IF NOT EXISTS quilt_patch_id TEXT,
    ADD COLUMN IF NOT EXISTS quilt_object_id TEXT,
    ADD COLUMN IF NOT EXISTS storage_kind TEXT NOT NULL DEFAULT 'blob';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vector_entries_storage_kind_check'
    ) THEN
        ALTER TABLE vector_entries
            ADD CONSTRAINT vector_entries_storage_kind_check
            CHECK (storage_kind IN ('blob', 'quilt'));
    END IF;
END $$;

ALTER TABLE vector_entries ALTER COLUMN blob_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vector_entries_quilt_id
    ON vector_entries(quilt_id) WHERE quilt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vector_entries_quilt_patch_id
    ON vector_entries(quilt_patch_id) WHERE quilt_patch_id IS NOT NULL;
