-- Accounts describe ownership only. Credentials remain in each project's
-- immutable, one-to-one Nora workspace binding.
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK(kind IN ('client','internal')),
  contact_name text NOT NULL DEFAULT '' CHECK(length(contact_name)<=200),
  contact_email text NOT NULL DEFAULT '' CHECK(length(contact_email)<=320),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_creator ON customers(created_by);
CREATE TABLE customer_memberships (
  customer_id uuid NOT NULL REFERENCES customers(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK(role IN ('owner','member')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(customer_id,user_id)
);
CREATE INDEX customer_memberships_user ON customer_memberships(user_id,customer_id);
CREATE TABLE customer_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  provider text NOT NULL CHECK(provider IN ('slack','discord','google_drive','onedrive')),
  external_workspace_id text NOT NULL DEFAULT '' CHECK(length(external_workspace_id)<=300),
  manager_user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(customer_id,manager_user_id) REFERENCES customer_memberships(customer_id,user_id)
);
CREATE INDEX customer_connections_customer ON customer_connections(customer_id,created_at,id);
CREATE INDEX customer_connections_manager ON customer_connections(manager_user_id);
CREATE INDEX customer_connections_creator ON customer_connections(created_by);
CREATE TABLE project_customer_links (
  project_id text PRIMARY KEY REFERENCES projects(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  assigned_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_customer_links_customer ON project_customer_links(customer_id,project_id);
CREATE INDEX project_customer_links_actor ON project_customer_links(assigned_by);
CREATE TABLE project_connection_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES project_customer_links(project_id),
  connection_id uuid NOT NULL REFERENCES customer_connections(id),
  workspace_id text NOT NULL,
  connector_id text NOT NULL CHECK(length(connector_id) BETWEEN 1 AND 200),
  allowed_resources jsonb NOT NULL CHECK(jsonb_typeof(allowed_resources)='array' AND jsonb_array_length(allowed_resources) BETWEEN 1 AND 100),
  operator_id uuid NOT NULL REFERENCES users(id),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  UNIQUE(project_id,connector_id)
);
CREATE INDEX project_connection_grants_connection ON project_connection_grants(connection_id,project_id);
CREATE INDEX project_connection_grants_operator ON project_connection_grants(operator_id);
CREATE INDEX project_connection_grants_reviewer ON project_connection_grants(reviewer_id);
CREATE INDEX project_connection_grants_creator ON project_connection_grants(created_by);
ALTER TABLE nora_channel_sources ADD COLUMN connection_grant_id uuid;
-- This separate lease tracks an in-flight remote mutation even after local
-- authorization is revoked. Stop workers wait for its bounded expiration.
ALTER TABLE nora_channel_sources ADD COLUMN remote_provision_token uuid;
ALTER TABLE nora_channel_sources ADD COLUMN remote_provision_expires_at timestamptz;
ALTER TABLE nora_channel_sources ADD CONSTRAINT nora_remote_provision_lease_pair
  CHECK((remote_provision_token IS NULL)=(remote_provision_expires_at IS NULL));
ALTER TABLE nora_channel_sources ADD CONSTRAINT nora_source_connection_grant_fk
  FOREIGN KEY(connection_grant_id,project_id) REFERENCES project_connection_grants(id,project_id);
CREATE INDEX nora_channel_sources_grant ON nora_channel_sources(connection_grant_id,id);
CREATE TABLE customer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL,
  entity_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_audit_customer ON customer_audit(customer_id,created_at DESC,id);
CREATE INDEX customer_audit_actor ON customer_audit(actor_id);
CREATE TRIGGER customer_audit_append_only BEFORE UPDATE OR DELETE ON customer_audit FOR EACH ROW EXECUTE FUNCTION protect_event_history();

-- A durable stop request survives a process crash or unavailable Nora service.
CREATE TABLE nora_channel_stop_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL UNIQUE REFERENCES nora_channel_sources(id),
  project_id text NOT NULL REFERENCES projects(id),
  workspace_id text NOT NULL,
  pipeline_id text,
  trigger_pipeline_id text,
  source_version integer NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(snapshot)='object'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
  reason text NOT NULL,
  attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK((lease_token IS NULL)=(lease_expires_at IS NULL))
);
CREATE INDEX nora_channel_stop_due ON nora_channel_stop_jobs(next_attempt_at,id) WHERE status IN ('pending','failed','running');
CREATE INDEX nora_channel_stop_project ON nora_channel_stop_jobs(project_id,source_id);

-- Legacy evidence stays intact; existing collection requires explicit approval.
INSERT INTO nora_channel_stop_jobs(source_id,project_id,workspace_id,pipeline_id,trigger_pipeline_id,source_version,snapshot,reason)
 SELECT id,project_id,workspace_id,pipeline_id,trigger_pipeline_id,version,
   jsonb_build_object('sourceId',id,'projectId',project_id,'workspaceId',workspace_id,'connectorId',connector_id,'externalChannelId',external_channel_id,'name',name,'intervalMinutes',interval_minutes,'scheduleEnabled',schedule_enabled,'triggerEnabled',trigger_enabled,'pipelineId',pipeline_id,'triggerPipelineId',trigger_pipeline_id,'libraryTag',library_tag),
   'CONNECTION_GRANT_REQUIRED'
 FROM nora_channel_sources;
UPDATE nora_channel_sources SET status='draft',schedule_enabled=false,trigger_enabled=false,trigger_token_hash=NULL,lease_token=NULL,lease_expires_at=NULL,provision_token=NULL,version=version+1,last_error_code='CONNECTION_GRANT_REQUIRED',updated_at=now();
UPDATE channel_sources SET manual_intake_enabled=false WHERE id IN (SELECT id FROM nora_channel_sources);
UPDATE nora_channel_deliveries SET status=CASE WHEN status IN ('running','submitted') THEN 'uncertain' ELSE 'failed' END,error_code='CONNECTION_GRANT_REQUIRED',completed_at=now() WHERE status IN ('queued','running','submitted');
