-- A frozen evidence snapshot is reviewed before work is authorized. Locks reserve impact, never Git files.
CREATE TABLE work_preflights (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 work_item_id uuid,
 plan_id uuid,
 request_sha256 text NOT NULL,
 input_snapshot jsonb NOT NULL,
 input_sha256 text NOT NULL,
 report jsonb NOT NULL,
 nora_analysis jsonb,
 status text NOT NULL DEFAULT 'needs_review' CHECK(status IN ('needs_review','approved')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 decision jsonb,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 FOREIGN KEY(work_item_id,project_id) REFERENCES work_items(id,project_id),
 FOREIGN KEY(plan_id,project_id) REFERENCES implementation_plans(id,project_id),
 CHECK((status='approved')=(decision IS NOT NULL))
);
CREATE INDEX work_preflight_project_idx ON work_preflights(project_id,created_at DESC,id);
CREATE INDEX work_preflight_item_idx ON work_preflights(project_id,work_item_id,created_at DESC);
CREATE INDEX work_preflight_plan_idx ON work_preflights(project_id,plan_id,created_at DESC);
CREATE INDEX work_preflight_creator_idx ON work_preflights(created_by);
CREATE TABLE work_scope_locks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id text NOT NULL REFERENCES projects(id),
 preflight_id uuid NOT NULL UNIQUE,
 work_item_id uuid,
 plan_id uuid,
 resources jsonb NOT NULL,
 assignee_id uuid,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),
 released_by uuid REFERENCES users(id),
 released_at timestamptz,
 release_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 FOREIGN KEY(preflight_id,project_id) REFERENCES work_preflights(id,project_id),
 FOREIGN KEY(work_item_id,project_id) REFERENCES work_items(id,project_id),
 FOREIGN KEY(plan_id,project_id) REFERENCES implementation_plans(id,project_id),
 FOREIGN KEY(project_id,assignee_id) REFERENCES memberships(project_id,user_id),
 CHECK((status='released')=(released_at IS NOT NULL))
);
CREATE INDEX work_scope_active_idx ON work_scope_locks(project_id,created_at) WHERE status='active';
CREATE INDEX work_scope_item_idx ON work_scope_locks(project_id,work_item_id);
CREATE INDEX work_scope_plan_idx ON work_scope_locks(project_id,plan_id);
CREATE INDEX work_scope_assignee_idx ON work_scope_locks(project_id,assignee_id);
CREATE INDEX work_scope_releaser_idx ON work_scope_locks(released_by);
CREATE TABLE work_result_artifacts (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 preflight_id uuid NOT NULL,
 work_item_id uuid,
 kind text NOT NULL CHECK(kind IN ('pr','commit','document','test','other')),
 title text NOT NULL,
 payload jsonb NOT NULL,
 content_sha256 text NOT NULL,
 request_sha256 text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 FOREIGN KEY(preflight_id,project_id) REFERENCES work_preflights(id,project_id),
 FOREIGN KEY(work_item_id,project_id) REFERENCES work_items(id,project_id)
);
CREATE INDEX work_result_preflight_idx ON work_result_artifacts(project_id,preflight_id,created_at);
CREATE INDEX work_result_item_idx ON work_result_artifacts(project_id,work_item_id,created_at);
CREATE INDEX work_result_creator_idx ON work_result_artifacts(created_by);
CREATE TABLE work_result_validations (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 preflight_id uuid NOT NULL,
 request_sha256 text NOT NULL,
 input_snapshot jsonb NOT NULL,
 input_sha256 text NOT NULL,
 report jsonb NOT NULL,
 nora_analysis jsonb,
 status text NOT NULL DEFAULT 'needs_review' CHECK(status IN ('needs_review','accepted','changes_requested')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 decision jsonb,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 FOREIGN KEY(preflight_id,project_id) REFERENCES work_preflights(id,project_id),
 CHECK((status<>'needs_review')=(decision IS NOT NULL))
);
CREATE INDEX work_validation_project_idx ON work_result_validations(project_id,created_at DESC);
CREATE INDEX work_validation_preflight_idx ON work_result_validations(project_id,preflight_id,created_at DESC);
CREATE INDEX work_validation_creator_idx ON work_result_validations(created_by);
CREATE TABLE maintenance_classifications (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 request_sha256 text NOT NULL,
 input_snapshot jsonb NOT NULL,
 report jsonb NOT NULL,
 nora_analysis jsonb,
 status text NOT NULL DEFAULT 'needs_review' CHECK(status IN ('needs_review','confirmed')),
 version bigint NOT NULL DEFAULT 1,
 decision jsonb,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 CHECK((status='confirmed')=(decision IS NOT NULL))
);
CREATE INDEX maintenance_classification_project_idx ON maintenance_classifications(project_id,created_at DESC);
CREATE INDEX maintenance_classification_creator_idx ON maintenance_classifications(created_by);
CREATE FUNCTION protect_work_governance_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status'-'version'-'decision'-'nora_analysis'-'updated_at')
 IS DISTINCT FROM (to_jsonb(OLD)-'status'-'version'-'decision'-'nora_analysis'-'updated_at') THEN
 RAISE EXCEPTION 'Governance evidence snapshot is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.nora_analysis IS NOT NULL AND NEW.nora_analysis IS DISTINCT FROM OLD.nora_analysis THEN RAISE EXCEPTION 'Attached AI analysis is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.decision IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
 RAISE EXCEPTION 'Governance decision is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Governance changes require the next version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_preflight_immutable BEFORE UPDATE ON work_preflights FOR EACH ROW EXECUTE FUNCTION protect_work_governance_snapshot();
CREATE TRIGGER work_validation_immutable BEFORE UPDATE ON work_result_validations FOR EACH ROW EXECUTE FUNCTION protect_work_governance_snapshot();
CREATE TRIGGER maintenance_classification_immutable BEFORE UPDATE ON maintenance_classifications FOR EACH ROW EXECUTE FUNCTION protect_work_governance_snapshot();
CREATE TRIGGER work_preflight_no_delete BEFORE DELETE ON work_preflights FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER work_validation_no_delete BEFORE DELETE ON work_result_validations FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER maintenance_classification_no_delete BEFORE DELETE ON maintenance_classifications FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER work_artifact_append_only BEFORE UPDATE OR DELETE ON work_result_artifacts FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE FUNCTION protect_work_scope_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.preflight_id,NEW.work_item_id,NEW.plan_id,NEW.resources,NEW.assignee_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.preflight_id,OLD.work_item_id,OLD.plan_id,OLD.resources,OLD.assignee_id,OLD.created_at) OR OLD.status='released' OR NEW.status<>'released' THEN
 RAISE EXCEPTION 'Scope reservation is immutable; release and review a new scope' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_scope_immutable BEFORE UPDATE ON work_scope_locks FOR EACH ROW EXECUTE FUNCTION protect_work_scope_lock();
CREATE TRIGGER work_scope_no_delete BEFORE DELETE ON work_scope_locks FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
