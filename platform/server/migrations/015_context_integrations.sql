CREATE TABLE context_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id text NOT NULL REFERENCES projects(id),
  source_id uuid NOT NULL, provider text NOT NULL CHECK(provider IN ('gmail','drive','slack','discord','github','teams','kakaotalk')),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200), scope jsonb NOT NULL,
  secret_ciphertext text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  interval_seconds integer NOT NULL DEFAULT 900 CHECK(interval_seconds BETWEEN 300 AND 86400),
  cursor jsonb NOT NULL DEFAULT '{}', next_sync_at timestamptz NOT NULL DEFAULT now(),
  tested_at timestamptz, last_sync_at timestamptz, last_error_code text,
  sync_requested boolean NOT NULL DEFAULT false, lease_token uuid, lease_expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id), UNIQUE(source_id), FOREIGN KEY(source_id,project_id) REFERENCES channel_sources(id,project_id)
);
CREATE INDEX context_integrations_due ON context_integrations(next_sync_at) WHERE enabled OR sync_requested;
CREATE INDEX context_integrations_project ON context_integrations(project_id,created_at DESC);
CREATE TABLE integration_objects (
  integration_id uuid NOT NULL REFERENCES context_integrations(id), external_id text NOT NULL,
  content_hash text NOT NULL, event_payload jsonb NOT NULL, delivered boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL DEFAULT now(), checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(integration_id,external_id)
);
CREATE INDEX integration_objects_pending ON integration_objects(integration_id) WHERE NOT delivered;
CREATE INDEX integration_objects_reconcile ON integration_objects(integration_id,checked_at);
CREATE TABLE integration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), integration_id uuid NOT NULL REFERENCES context_integrations(id),
  project_id text NOT NULL REFERENCES projects(id), status text NOT NULL CHECK(status IN ('running','completed','failed')),
  observed_count integer NOT NULL DEFAULT 0, delivered_count integer NOT NULL DEFAULT 0,
  error_code text, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  FOREIGN KEY(integration_id,project_id) REFERENCES context_integrations(id,project_id)
);
CREATE INDEX integration_runs_project ON integration_runs(project_id,started_at DESC);
CREATE INDEX integration_runs_integration ON integration_runs(integration_id,started_at DESC);
CREATE FUNCTION protect_integration_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.source_id,NEW.provider,NEW.scope,NEW.created_by,NEW.created_at)
  IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.source_id,OLD.provider,OLD.scope,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Integration identity and scope are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER integration_identity BEFORE UPDATE ON context_integrations FOR EACH ROW EXECUTE FUNCTION protect_integration_identity();
CREATE TABLE integration_threads (
  integration_id uuid NOT NULL REFERENCES context_integrations(id), root_id text NOT NULL,
  cursor jsonb NOT NULL DEFAULT '{}', checked_at timestamptz NOT NULL DEFAULT '1970-01-01',
  error_code text, PRIMARY KEY(integration_id,root_id)
);
CREATE INDEX integration_threads_next ON integration_threads(integration_id,checked_at);
