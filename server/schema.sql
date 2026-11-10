CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  source_type text NOT NULL CHECK (source_type IN ('webpage', 'pdf', 'paragraph')),
  source_url text,
  object_key text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (source_type <> 'pdf' OR object_key IS NOT NULL),
  CHECK (source_type <> 'paragraph' OR source_url IS NULL)
);

CREATE INDEX IF NOT EXISTS knowledge_sources_active_created_idx
  ON knowledge_sources (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS knowledge_source_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES knowledge_sources (id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  location text NOT NULL,
  content text NOT NULL CHECK (length(trim(content)) > 0),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  UNIQUE (source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS knowledge_source_chunks_search_idx
  ON knowledge_source_chunks USING gin (search_vector);

CREATE TABLE IF NOT EXISTS curator_allowlist (
  auth_user_id text PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  auth_user_id text PRIMARY KEY,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 100),
  preferred_language text NOT NULL CHECK (preferred_language IN ('en', 'afr', 'es', 'fr')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
