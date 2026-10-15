-- Nora owns upstream credentials and collection. AINS owns reviewable evidence.
CREATE TABLE nora_channel_sources (
  id uuid PRIMARY KEY REFERENCES channel_sources(id),
  project_id text NOT NULL REFERENCES projects(id),
  workspace_id text NOT NULL,
  connector_id text NOT NULL,
  provider text NOT NULL,
  external_channel_id text NOT NULL,
  name text NOT NULL,
  schedule_enabled boolean NOT NULL DEFAULT false,
  trigger_enabled boolean NOT NULL DEFAULT false,
  interval_minutes integer NOT NULL DEFAULT 15 CHECK(interval_minutes IN (5,10,15,30,60,120,360,720,1440)),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','provisioning','ready','error')),
  version integer NOT NULL DEFAULT 1,
  pipeline_id text,
  trigger_pipeline_id text,
  library_tag text,
  trigger_token_hash text CHECK(trigger_token_hash IS NULL OR trigger_token_hash ~ '^[a-f0-9]{64}$'),
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_received_at timestamptz,
  last_error_code text,
  next_sync_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provision_token uuid,
  provision_started_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  UNIQUE(project_id,connector_id,external_channel_id),
  FOREIGN KEY(id,project_id) REFERENCES channel_sources(id,project_id)
);
CREATE INDEX nora_channel_sources_due ON nora_channel_sources(next_sync_at,id) WHERE status='ready';
CREATE INDEX nora_channel_sources_creator ON nora_channel_sources(created_by);
CREATE TABLE nora_channel_objects (
  source_id uuid NOT NULL REFERENCES nora_channel_sources(id),
  external_id text NOT NULL,
  content_hash text NOT NULL,
  event_payload jsonb NOT NULL,
  delivered boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_id,external_id)
);
CREATE INDEX nora_channel_objects_pending ON nora_channel_objects(source_id,updated_at,external_id) WHERE NOT delivered;
CREATE TABLE nora_channel_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  project_id text NOT NULL,
  entry_point text NOT NULL CHECK(entry_point IN ('manual','trigger','reconcile')),
  event_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','submitted','completed','failed','uncertain')),
  nora_run_id text,
  error_code text,
  message_count integer NOT NULL DEFAULT 0,
  inbox_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(source_id,entry_point,event_key),
  FOREIGN KEY(source_id,project_id) REFERENCES nora_channel_sources(id,project_id)
);
CREATE INDEX nora_channel_deliveries_recent ON nora_channel_deliveries(project_id,source_id,created_at DESC);
CREATE INDEX nora_channel_deliveries_queue ON nora_channel_deliveries(created_at,id) WHERE status='queued';
