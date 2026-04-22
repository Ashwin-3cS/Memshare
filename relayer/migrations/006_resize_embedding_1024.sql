-- Resize embedding column from 1536 → 1024 dims (Jina jina-embeddings-v3).
-- Safe on fresh DB (no rows) and on DBs where all existing vectors are 1024-dim.
-- Drops HNSW index first because it's tied to the column's vector type.

DROP INDEX IF EXISTS idx_vector_entries_embedding;

DO $$
DECLARE
    current_type TEXT;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO current_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relname = 'vector_entries'
       AND a.attname = 'embedding';

    IF current_type IS DISTINCT FROM 'vector(1024)' THEN
        ALTER TABLE vector_entries ALTER COLUMN embedding TYPE vector(1024);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vector_entries_embedding
    ON vector_entries USING hnsw (embedding vector_cosine_ops);
