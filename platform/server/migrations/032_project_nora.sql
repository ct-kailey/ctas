-- Nora workspaces are selected by the owner. This migration neither creates
-- remote workspaces nor connects historical projects automatically.
CREATE TABLE project_nora_workspaces (
  project_id text PRIMARY KEY REFERENCES projects(id),
  workspace_id text NOT NULL UNIQUE CHECK (workspace_id ~ '^t_[A-Za-z0-9_-]{8,128}$'),
  request_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES users(id),
  project_name text NOT NULL,
  space_id text,
  connector_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','awaiting_service','awaiting_auth','verifying','ready','failed','uncertain')),
  operation text NOT NULL DEFAULT 'verify' CHECK (operation IN ('verify','reconcile')),
  stage text NOT NULL DEFAULT 'queued' CHECK (stage IN ('queued','inspecting','context_space','complete')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^NORA_[A-Z0-9_]{1,80}$'),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'ready' OR (space_id IS NOT NULL AND stage = 'complete')),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);
CREATE INDEX project_nora_requested_by_idx ON project_nora_workspaces(requested_by);
CREATE INDEX project_nora_pending_idx ON project_nora_workspaces(created_at,project_id) WHERE status = 'pending';
CREATE INDEX project_nora_expired_idx ON project_nora_workspaces(lease_expires_at) WHERE status = 'verifying';

CREATE FUNCTION protect_project_nora_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.project_id,NEW.workspace_id,NEW.request_id,NEW.requested_by,NEW.project_name,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.project_id,OLD.workspace_id,OLD.request_id,OLD.requested_by,OLD.project_name,OLD.created_at)
    OR (OLD.space_id IS NOT NULL AND NEW.space_id IS DISTINCT FROM OLD.space_id) THEN
    RAISE EXCEPTION 'Nora workspace binding is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_nora_binding_immutable BEFORE UPDATE ON project_nora_workspaces FOR EACH ROW EXECUTE FUNCTION protect_project_nora_binding();
CREATE TRIGGER project_nora_binding_no_delete BEFORE DELETE ON project_nora_workspaces FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

-- Immutable event identity lets providers upsert the same note after a timeout.
-- Ordering is per project; a failed earlier event blocks later events.
CREATE TABLE project_nora_context_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  project_id text NOT NULL REFERENCES project_nora_workspaces(project_id),
  event_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('context_record','context_supersession')),
  context_version bigint NOT NULL CHECK (context_version > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','syncing','succeeded','failed','awaiting_service','awaiting_auth')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^NORA_[A-Z0-9_]{1,80}$'),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  UNIQUE (project_id,event_key),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK (status <> 'succeeded' OR synced_at IS NOT NULL)
);
CREATE INDEX project_nora_outbox_project_idx ON project_nora_context_outbox(project_id,sequence);
CREATE INDEX project_nora_outbox_pending_idx ON project_nora_context_outbox(sequence) WHERE status = 'pending';
CREATE INDEX project_nora_outbox_expired_idx ON project_nora_context_outbox(lease_expires_at) WHERE status = 'syncing';

CREATE FUNCTION protect_project_nora_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.sequence,NEW.project_id,NEW.event_key,NEW.kind,NEW.context_version,NEW.payload,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.sequence,OLD.project_id,OLD.event_key,OLD.kind,OLD.context_version,OLD.payload,OLD.created_at) THEN
    RAISE EXCEPTION 'Nora Context event is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_nora_event_immutable BEFORE UPDATE ON project_nora_context_outbox FOR EACH ROW EXECUTE FUNCTION protect_project_nora_event();
CREATE TRIGGER project_nora_event_no_delete BEFORE DELETE ON project_nora_context_outbox FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

CREATE FUNCTION enqueue_project_nora_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_value bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM project_nora_workspaces WHERE project_id = NEW.project_id) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'context_records' THEN
    INSERT INTO project_nora_context_outbox(project_id,event_key,kind,context_version,payload)
      VALUES (NEW.project_id,'record:' || NEW.id,'context_record',NEW.context_version,jsonb_build_object('record',to_jsonb(NEW)))
      ON CONFLICT (project_id,event_key) DO NOTHING;
  ELSE
    SELECT context_version INTO version_value FROM context_records WHERE project_id = NEW.project_id AND id = NEW.replacement_id;
    INSERT INTO project_nora_context_outbox(project_id,event_key,kind,context_version,payload)
      VALUES (NEW.project_id,'supersession:' || NEW.previous_id,'context_supersession',version_value,to_jsonb(NEW))
      ON CONFLICT (project_id,event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_nora_record_outbox AFTER INSERT ON context_records FOR EACH ROW EXECUTE FUNCTION enqueue_project_nora_context();
CREATE TRIGGER project_nora_supersession_outbox AFTER INSERT ON context_supersessions FOR EACH ROW EXECUTE FUNCTION enqueue_project_nora_context();
