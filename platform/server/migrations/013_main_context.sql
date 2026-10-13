-- Main Context is a project-scoped, reviewed layer over existing source records.
CREATE TABLE context_heads (
 project_id text PRIMARY KEY REFERENCES projects(id),
 version bigint NOT NULL DEFAULT 0 CHECK(version>=0)
);
CREATE TABLE context_candidates (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 domain_id uuid,
 replaces_candidate_id uuid,
 base_version bigint NOT NULL CHECK(base_version>=0),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','merged','rejected','replaced')),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 decision jsonb,
 UNIQUE(id,project_id),
 FOREIGN KEY(domain_id,project_id) REFERENCES project_domains(id,project_id),
 FOREIGN KEY(replaces_candidate_id,project_id) REFERENCES context_candidates(id,project_id),
 CHECK((status<>'pending')=(decision IS NOT NULL))
);
CREATE INDEX context_candidates_pending_idx ON context_candidates(project_id,created_at DESC,id) WHERE status='pending';
CREATE INDEX context_candidates_domain_idx ON context_candidates(project_id,domain_id);
CREATE INDEX context_candidates_replaces_idx ON context_candidates(replaces_candidate_id);
CREATE INDEX context_candidates_creator_idx ON context_candidates(created_by);
CREATE TABLE context_records (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 candidate_id uuid NOT NULL,
 domain_id uuid,
 context_version bigint NOT NULL CHECK(context_version>0),
 kind text NOT NULL CHECK(kind IN ('requirement','decision','question','change','retrospective','meeting','knowledge','note')),
 entity_key text NOT NULL DEFAULT '',
 title text NOT NULL,
 body text NOT NULL,
 occurred_at timestamptz NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES users(id),
 reviewed_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 UNIQUE(project_id,context_version),
 UNIQUE(candidate_id),
 FOREIGN KEY(candidate_id,project_id) REFERENCES context_candidates(id,project_id),
 FOREIGN KEY(domain_id,project_id) REFERENCES project_domains(id,project_id)
);
CREATE INDEX context_records_project_idx ON context_records(project_id,created_at DESC,id);
CREATE INDEX context_records_key_idx ON context_records(project_id,domain_id,entity_key) WHERE entity_key<>'';
CREATE INDEX context_records_domain_idx ON context_records(project_id,domain_id);
CREATE INDEX context_records_creator_idx ON context_records(created_by);
CREATE INDEX context_records_reviewer_idx ON context_records(reviewed_by);
CREATE TABLE context_supersessions (
 project_id text NOT NULL REFERENCES projects(id),
 previous_id uuid NOT NULL,
 replacement_id uuid NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(previous_id),
 FOREIGN KEY(previous_id,project_id) REFERENCES context_records(id,project_id),
 FOREIGN KEY(replacement_id,project_id) REFERENCES context_records(id,project_id),
 CHECK(previous_id<>replacement_id)
);
CREATE INDEX context_supersessions_replacement_idx ON context_supersessions(project_id,replacement_id);
CREATE TRIGGER context_records_immutable BEFORE UPDATE OR DELETE ON context_records FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TRIGGER context_supersessions_immutable BEFORE UPDATE OR DELETE ON context_supersessions FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE FUNCTION protect_context_candidate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.domain_id,NEW.replaces_candidate_id,NEW.base_version,NEW.payload,NEW.content_sha256,NEW.request_sha256,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.domain_id,OLD.replaces_candidate_id,OLD.base_version,OLD.payload,OLD.content_sha256,OLD.request_sha256,OLD.created_by,OLD.created_at) THEN
 RAISE EXCEPTION 'Context candidate snapshot is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.decision IS NOT NULL AND ROW(NEW.status,NEW.decision) IS DISTINCT FROM ROW(OLD.status,OLD.decision) THEN
 RAISE EXCEPTION 'Context review decision is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER context_candidate_immutable BEFORE UPDATE ON context_candidates FOR EACH ROW EXECUTE FUNCTION protect_context_candidate();
CREATE TRIGGER context_candidate_no_delete BEFORE DELETE ON context_candidates FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
