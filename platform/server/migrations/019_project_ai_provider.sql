CREATE TABLE project_ai_providers (
  project_id text PRIMARY KEY REFERENCES projects(id),
  secret_envelope jsonb,
  enabled boolean NOT NULL DEFAULT false,
  embedding_model text NOT NULL DEFAULT 'text-embedding-3-small',
  transcription_model text NOT NULL DEFAULT 'whisper-1',
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_ai_providers_updated_by_idx ON project_ai_providers(updated_by);
