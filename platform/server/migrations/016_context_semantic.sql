-- Portable embeddings: project-scoped bounded cosine search works without pgvector.
CREATE TABLE context_semantic_settings (
 project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 model text NOT NULL DEFAULT 'text-embedding-3-small',
 dimensions integer NOT NULL DEFAULT 512 CHECK (dimensions BETWEEN 2 AND 1536),
 next_sync_at timestamptz NOT NULL DEFAULT now(),
 last_synced_at timestamptz,
 source_count integer NOT NULL DEFAULT 0,
 excluded_sources integer NOT NULL DEFAULT 0,
 truncated_sources integer NOT NULL DEFAULT 0,
 last_error text,
 updated_by uuid REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX context_semantic_sync_idx ON context_semantic_settings(next_sync_at) WHERE enabled;
CREATE TABLE context_semantic_chunks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 source_type text NOT NULL CHECK (source_type IN ('revision','commercial_revision','channel_inbox','context_record')),
 source_id uuid NOT NULL,
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
 domain_id uuid,
 chunk_number integer NOT NULL CHECK (chunk_number BETWEEN 0 AND 31),
 chunk_text text NOT NULL CHECK (octet_length(chunk_text) BETWEEN 1 AND 6000),
 chunk_sha256 text NOT NULL CHECK (chunk_sha256 ~ '^[a-f0-9]{64}$'),
 model text NOT NULL,
 dimensions integer NOT NULL CHECK (dimensions BETWEEN 2 AND 1536),
 vector real[],
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
 lease_id uuid,
 lease_until timestamptz,
 retry_at timestamptz NOT NULL DEFAULT now(),
 error_code text,
 indexed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (project_id,source_type,source_id,chunk_number),
 CHECK (vector IS NULL OR (array_ndims(vector)=1 AND cardinality(vector)=dimensions)),
 CHECK ((status='ready')=(vector IS NOT NULL)),
 FOREIGN KEY (domain_id,project_id) REFERENCES project_domains(id,project_id)
);
CREATE INDEX context_semantic_chunks_project_idx ON context_semantic_chunks(project_id,model,dimensions,status);
CREATE INDEX context_semantic_queue_idx ON context_semantic_chunks(project_id,retry_at) WHERE status IN ('queued','running');
CREATE TABLE context_semantic_usage (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
 reserved_bytes integer NOT NULL DEFAULT 0 CHECK (reserved_bytes>=0),
 query_requests integer NOT NULL DEFAULT 0 CHECK (query_requests>=0),
 PRIMARY KEY (project_id,day)
);
