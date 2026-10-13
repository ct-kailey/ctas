-- A source is an explicitly registered destination. No network connector is enabled yet.
CREATE TABLE channel_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  provider text NOT NULL CHECK (provider IN ('kakaotalk','discord','slack','teams','other')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  external_workspace_id text CHECK (length(external_workspace_id) BETWEEN 1 AND 300),
  external_channel_id text NOT NULL CHECK (length(external_channel_id) BETWEEN 1 AND 300),
  default_domain_id uuid,
  enabled boolean NOT NULL DEFAULT true,
  manual_intake_enabled boolean NOT NULL DEFAULT true,
  connection_status text NOT NULL DEFAULT 'not_connected' CHECK (connection_status = 'not_connected'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  FOREIGN KEY(default_domain_id,project_id) REFERENCES project_domains(id,project_id)
);
CREATE UNIQUE INDEX channel_sources_identity_idx ON channel_sources(project_id,provider,COALESCE(external_workspace_id,''),external_channel_id);
CREATE INDEX channel_sources_domain_idx ON channel_sources(default_domain_id,project_id);
CREATE INDEX channel_sources_creator_idx ON channel_sources(created_by);
CREATE TABLE channel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  project_id text NOT NULL,
  source_id uuid NOT NULL,
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 300),
  message_id text NOT NULL CHECK (length(message_id) BETWEEN 1 AND 300),
  conversation_key text NOT NULL CHECK (length(conversation_key) BETWEEN 1 AND 300),
  kind text NOT NULL CHECK (kind IN ('created','updated','deleted')),
  author text NOT NULL CHECK (length(author) BETWEEN 1 AND 200),
  text text NOT NULL CHECK (length(text)<=20000),
  sent_at timestamptz,
  changed_at timestamptz,
  raw_sent_at text,
  raw_changed_at text,
  url text CHECK (length(url)<=2048),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,event_id),
  FOREIGN KEY(source_id,project_id) REFERENCES channel_sources(id,project_id)
);
CREATE INDEX channel_events_message_idx ON channel_events(source_id,message_id,sequence DESC);
CREATE INDEX channel_events_project_idx ON channel_events(project_id,received_at DESC);
CREATE TABLE channel_inbox (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  source_id uuid NOT NULL,
  batch_id text NOT NULL CHECK (length(batch_id) BETWEEN 1 AND 300),
  conversation_key text NOT NULL CHECK (length(conversation_key) BETWEEN 1 AND 300),
  batch_sha256 text NOT NULL CHECK (batch_sha256 ~ '^[a-f0-9]{64}$'),
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot)='object'),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  message_ids text[] NOT NULL CHECK (cardinality(message_ids) BETWEEN 1 AND 50),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','needs_review','failed','uncertain','accepted','dismissed')),
  analysis jsonb CHECK (analysis IS NULL OR jsonb_typeof(analysis)='object'),
  trace_id text,
  error_code text,
  lease_token uuid,
  lease_expires_at timestamptz,
  evidence_changed boolean NOT NULL DEFAULT false,
  provenance_changed boolean NOT NULL DEFAULT false,
  review jsonb,
  document_id uuid,
  revision_id uuid,
  job_id uuid REFERENCES jobs(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(source_id,batch_id),
  UNIQUE(id,source_id,project_id),
  UNIQUE(source_id,conversation_key,evidence_sha256),
  FOREIGN KEY(source_id,project_id) REFERENCES channel_sources(id,project_id),
  FOREIGN KEY(document_id,project_id) REFERENCES documents(id,project_id),
  FOREIGN KEY(revision_id,project_id,document_id) REFERENCES revisions(id,project_id,document_id),
  CHECK ((status IN ('accepted','dismissed')) = (review IS NOT NULL)),
  CHECK (status <> 'accepted' OR (document_id IS NOT NULL AND revision_id IS NOT NULL AND job_id IS NOT NULL)),
  CHECK (status = 'accepted' OR (document_id IS NULL AND revision_id IS NULL AND job_id IS NULL)),
  CHECK (NOT provenance_changed OR evidence_changed)
);
CREATE INDEX channel_inbox_project_idx ON channel_inbox(project_id,created_at DESC,id);
CREATE INDEX channel_inbox_source_idx ON channel_inbox(source_id,created_at DESC);
CREATE INDEX channel_inbox_messages_idx ON channel_inbox USING gin(message_ids);
CREATE INDEX channel_inbox_claim_idx ON channel_inbox(created_at,id) WHERE status='queued';
CREATE INDEX channel_inbox_expired_idx ON channel_inbox(lease_expires_at) WHERE status='running';
CREATE INDEX channel_inbox_revision_idx ON channel_inbox(revision_id);
CREATE INDEX channel_inbox_document_idx ON channel_inbox(document_id);
CREATE INDEX channel_inbox_job_idx ON channel_inbox(job_id);
CREATE INDEX channel_inbox_creator_idx ON channel_inbox(created_by);
-- Receipts retain aliases when the same evidence set arrives in a differently named batch.
CREATE TABLE channel_batches (
  source_id uuid NOT NULL,
  project_id text NOT NULL,
  batch_id text NOT NULL CHECK(length(batch_id) BETWEEN 1 AND 300),
  batch_sha256 text NOT NULL CHECK(batch_sha256 ~ '^[a-f0-9]{64}$'),
  inbox_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_id,batch_id),
  FOREIGN KEY(source_id,project_id) REFERENCES channel_sources(id,project_id),
  FOREIGN KEY(inbox_id,source_id,project_id) REFERENCES channel_inbox(id,source_id,project_id)
);
CREATE INDEX channel_batches_inbox_idx ON channel_batches(inbox_id);
CREATE INDEX channel_batches_project_idx ON channel_batches(project_id,created_at DESC);
CREATE TRIGGER channel_batches_immutable BEFORE UPDATE OR DELETE ON channel_batches FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE FUNCTION protect_channel_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.provider,NEW.name,NEW.external_workspace_id,NEW.external_channel_id,NEW.default_domain_id,NEW.created_by,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.provider,OLD.name,OLD.external_workspace_id,OLD.external_channel_id,OLD.default_domain_id,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Channel source identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER channel_source_identity BEFORE UPDATE ON channel_sources FOR EACH ROW EXECUTE FUNCTION protect_channel_source();
CREATE TRIGGER channel_source_no_delete BEFORE DELETE ON channel_sources FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER channel_events_immutable BEFORE UPDATE OR DELETE ON channel_events FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE FUNCTION protect_channel_inbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.source_id,NEW.batch_id,NEW.conversation_key,NEW.batch_sha256,NEW.input_snapshot,NEW.input_sha256,NEW.evidence_sha256,NEW.message_ids,NEW.created_by,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.source_id,OLD.batch_id,OLD.conversation_key,OLD.batch_sha256,OLD.input_snapshot,OLD.input_sha256,OLD.evidence_sha256,OLD.message_ids,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Channel input is immutable' USING ERRCODE='23514';
  END IF;
  IF (OLD.evidence_changed AND NOT NEW.evidence_changed) OR (OLD.provenance_changed AND NOT NEW.provenance_changed) THEN
    RAISE EXCEPTION 'Changed source evidence cannot be cleared' USING ERRCODE='23514';
  END IF;
  IF OLD.review IS NOT NULL AND ROW(NEW.status,NEW.analysis,NEW.trace_id,NEW.error_code,NEW.review,NEW.document_id,NEW.revision_id,NEW.job_id,NEW.completed_at)
     IS DISTINCT FROM ROW(OLD.status,OLD.analysis,OLD.trace_id,OLD.error_code,OLD.review,OLD.document_id,OLD.revision_id,OLD.job_id,OLD.completed_at) THEN
    RAISE EXCEPTION 'Channel review decision is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.status='accepted' AND OLD.status<>'accepted' AND NEW.evidence_changed THEN
    RAISE EXCEPTION 'Changed channel evidence cannot be accepted' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER channel_inbox_immutable BEFORE UPDATE ON channel_inbox FOR EACH ROW EXECUTE FUNCTION protect_channel_inbox();
CREATE TRIGGER channel_inbox_no_delete BEFORE DELETE ON channel_inbox FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
-- Mark any already collected snapshot touching a newly observed version as stale.
-- Accepted records remain intact, with their changed provenance made explicit.
CREATE FUNCTION flag_changed_channel_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE channel_inbox i SET evidence_changed=true,provenance_changed=(provenance_changed OR status='accepted')
    WHERE source_id=NEW.source_id AND message_ids @> ARRAY[NEW.message_id]
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(i.input_snapshot->'messages') m
      WHERE m->>'message_id'=NEW.message_id AND (
        (NEW.kind<>'created' AND m->>'kind'='created') OR
        ((NEW.kind='created')=(m->>'kind'='created') AND (
          (CASE WHEN NEW.kind='created' THEN NEW.sent_at ELSE NEW.changed_at END) IS NULL OR
          (CASE WHEN m->>'kind'='created' THEN m->>'sent_at' ELSE m->>'changed_at' END) IS NULL OR
          (CASE WHEN NEW.kind='created' THEN NEW.sent_at ELSE NEW.changed_at END) >=
          (CASE WHEN m->>'kind'='created' THEN m->>'sent_at' ELSE m->>'changed_at' END)::timestamptz
        ))
      )
    );
  RETURN NEW;
END $$;
CREATE TRIGGER channel_event_new_version AFTER INSERT ON channel_events FOR EACH ROW EXECUTE FUNCTION flag_changed_channel_evidence();
