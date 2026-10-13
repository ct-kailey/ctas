-- Contract preparation is available before repository configuration.
CREATE TABLE commercial_profiles (
 project_id text PRIMARY KEY REFERENCES projects(id),
 client_name text NOT NULL DEFAULT '' CHECK(length(client_name)<=300),
 company_info text NOT NULL DEFAULT '' CHECK(length(company_info)<=5000),
 project_scope text NOT NULL DEFAULT '' CHECK(length(project_scope)<=5000),
 schedule text NOT NULL DEFAULT '' CHECK(length(schedule)<=5000),
 budget text NOT NULL DEFAULT '' CHECK(length(budget)<=5000),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=5000),
 feedback_limit integer NOT NULL DEFAULT 3 CHECK(feedback_limit IN (2,3)),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 stage text NOT NULL DEFAULT 'planning' CHECK(stage IN ('planning','negotiating','contracted','handoff','on_hold')),
 confirmation jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((stage IN ('contracted','handoff'))=(confirmation IS NOT NULL))
);
CREATE TABLE commercial_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id text NOT NULL REFERENCES projects(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN ('proposal','estimate','contract')),
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=8000),
 sections jsonb NOT NULL CHECK(jsonb_typeof(sections)='array'),
 company_name text NOT NULL DEFAULT '' CHECK(length(company_name)<=300),
 footer text NOT NULL DEFAULT '' CHECK(length(footer)<=2000),
 is_sample boolean NOT NULL DEFAULT false,
 reference_revision_id uuid, created_by uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id), FOREIGN KEY(reference_revision_id,project_id) REFERENCES revisions(id,project_id)
);
CREATE INDEX commercial_templates_project_idx ON commercial_templates(project_id,created_at DESC,id);
CREATE INDEX commercial_templates_source_idx ON commercial_templates(reference_revision_id);
CREATE INDEX commercial_templates_creator_idx ON commercial_templates(created_by);
CREATE TABLE commercial_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id text NOT NULL REFERENCES projects(id),
 kind text NOT NULL CHECK(kind IN ('proposal','estimate','contract')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),latest_revision_id uuid,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id)
);
CREATE INDEX commercial_documents_project_idx ON commercial_documents(project_id,created_at DESC,id);
CREATE INDEX commercial_documents_creator_idx ON commercial_documents(created_by);
CREATE TABLE commercial_document_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id text NOT NULL,document_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),template_snapshot jsonb,
 source_revision_id uuid,origin text NOT NULL CHECK(origin IN ('editor','upload','nora_rewrite')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 5000),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),UNIQUE(id,project_id,document_id),UNIQUE(document_id,sequence),
 FOREIGN KEY(document_id,project_id) REFERENCES commercial_documents(id,project_id),
 FOREIGN KEY(source_revision_id,project_id) REFERENCES revisions(id,project_id)
);
CREATE INDEX commercial_revisions_project_idx ON commercial_document_revisions(project_id,document_id,sequence DESC);
CREATE INDEX commercial_revisions_source_idx ON commercial_document_revisions(source_revision_id);
CREATE INDEX commercial_revisions_creator_idx ON commercial_document_revisions(created_by);
ALTER TABLE commercial_documents ADD CONSTRAINT commercial_latest_fk FOREIGN KEY(latest_revision_id,project_id,id) REFERENCES commercial_document_revisions(id,project_id,document_id);
CREATE TABLE commercial_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id text NOT NULL,document_id uuid NOT NULL,revision_id uuid NOT NULL,
 profile_version bigint NOT NULL CHECK(profile_version>0),profile_sha256 text NOT NULL CHECK(profile_sha256~'^[a-f0-9]{64}$'),decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 5000),actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(revision_id,project_id,document_id) REFERENCES commercial_document_revisions(id,project_id,document_id)
);
CREATE INDEX commercial_decisions_revision_idx ON commercial_decisions(project_id,revision_id,created_at DESC,id DESC);
CREATE INDEX commercial_decisions_document_idx ON commercial_decisions(document_id);
CREATE INDEX commercial_decisions_actor_idx ON commercial_decisions(actor_id);
CREATE TABLE commercial_rewrites (
 id uuid PRIMARY KEY,project_id text NOT NULL,document_id uuid NOT NULL,source_revision_id uuid NOT NULL,
 profile_version bigint NOT NULL CHECK(profile_version>0),
 input_snapshot jsonb NOT NULL CHECK(jsonb_typeof(input_snapshot)='object'),input_sha256 text NOT NULL CHECK(input_sha256~'^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','needs_review','failed','uncertain','applied','dismissed')),
 result jsonb,trace_id text,error_code text,lease_token uuid,lease_expires_at timestamptz,
 applied_revision_id uuid,decision jsonb,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 UNIQUE(id,project_id),
 FOREIGN KEY(source_revision_id,project_id,document_id) REFERENCES commercial_document_revisions(id,project_id,document_id),
 FOREIGN KEY(applied_revision_id,project_id,document_id) REFERENCES commercial_document_revisions(id,project_id,document_id),
 CHECK(status NOT IN ('needs_review','applied') OR (result IS NOT NULL AND trace_id IS NOT NULL)),
 CHECK((status IN ('applied','dismissed'))=(decision IS NOT NULL)),
 CHECK((status='applied')=(applied_revision_id IS NOT NULL))
);
CREATE INDEX commercial_rewrites_project_idx ON commercial_rewrites(project_id,document_id,created_at DESC,id);
CREATE INDEX commercial_rewrites_source_idx ON commercial_rewrites(source_revision_id);
CREATE INDEX commercial_rewrites_applied_idx ON commercial_rewrites(applied_revision_id);
CREATE INDEX commercial_rewrites_creator_idx ON commercial_rewrites(created_by);
CREATE INDEX commercial_rewrites_claim_idx ON commercial_rewrites(created_at,id) WHERE status='queued';
CREATE INDEX commercial_rewrites_expired_idx ON commercial_rewrites(lease_expires_at) WHERE status='running';
CREATE TABLE commercial_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id text NOT NULL REFERENCES projects(id),round integer NOT NULL CHECK(round>0),
 document_revision_id uuid,request_text text NOT NULL CHECK(length(request_text) BETWEEN 1 AND 5000),
 requested_on date NOT NULL,channel text NOT NULL CHECK(length(channel) BETWEEN 1 AND 200),
 response_text text CHECK(length(response_text) BETWEEN 1 AND 10000),responded_on date,responded_by uuid REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,round),FOREIGN KEY(document_revision_id,project_id) REFERENCES commercial_document_revisions(id,project_id),
 CHECK ((response_text IS NULL)=(responded_on IS NULL)),CHECK((response_text IS NULL)=(responded_by IS NULL)),CHECK(responded_on IS NULL OR responded_on>=requested_on)
);
CREATE INDEX commercial_feedback_revision_idx ON commercial_feedback(document_revision_id);
CREATE INDEX commercial_feedback_creator_idx ON commercial_feedback(created_by);
CREATE INDEX commercial_feedback_responder_idx ON commercial_feedback(responded_by);
CREATE FUNCTION create_commercial_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO commercial_profiles(project_id) VALUES(NEW.id);
 INSERT INTO commercial_templates(project_id,name,kind,is_sample,instructions,sections) VALUES
 (NEW.id,'기본 제안서 (샘플)','proposal',true,'샘플 구조입니다. 사내 양식·실제 사업 조건을 확인하여 사용하세요.','[{"id":"overview","title":"프로젝트 개요","guidance":"배경과 목적"},{"id":"scope","title":"제안 범위","guidance":"포함·제외 범위"},{"id":"schedule","title":"추진 일정","guidance":"합의된 일정"}]'),
 (NEW.id,'기본 견적서 (샘플)','estimate',true,'샘플 구조입니다. 금액·세금·지급 조건을 임의로 추정하지 마세요.','[{"id":"overview","title":"견적 개요","guidance":"고객과 프로젝트"},{"id":"items","title":"견적 내역","guidance":"항목·수량·단가를 표에 작성"},{"id":"terms","title":"견적 조건","guidance":"유효기간·지급 조건"}]'),
 (NEW.id,'기본 계약서 (샘플)','contract',true,'샘플 구조이며 확정된 계약 양식이 아닙니다. 합의한 조건만 기재하세요.','[{"id":"parties","title":"계약 당사자","guidance":"실제 계약 주체"},{"id":"scope","title":"수행 범위","guidance":"포함·제외 범위"},{"id":"terms","title":"일정·대금·검수 조건","guidance":"합의한 조건"}]');
 RETURN NEW;
END $$;
CREATE TRIGGER project_commercial_default AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION create_commercial_defaults();
INSERT INTO commercial_profiles(project_id) SELECT id FROM projects;
-- Existing projects receive the same explicit sample templates.
INSERT INTO commercial_templates(project_id,name,kind,is_sample,instructions,sections)
SELECT p.id,v.name,v.kind,true,'샘플 구조입니다. 사내 양식·실제 사업 조건을 확인하여 사용하세요.',v.sections::jsonb FROM projects p CROSS JOIN (VALUES
('기본 제안서 (샘플)','proposal','[{"id":"overview","title":"프로젝트 개요","guidance":"배경과 목적"},{"id":"scope","title":"제안 범위","guidance":"포함·제외 범위"},{"id":"schedule","title":"추진 일정","guidance":"합의된 일정"}]'),
('기본 견적서 (샘플)','estimate','[{"id":"overview","title":"견적 개요","guidance":"고객과 프로젝트"},{"id":"items","title":"견적 내역","guidance":"항목·수량·단가를 표에 작성"},{"id":"terms","title":"견적 조건","guidance":"유효기간·지급 조건"}]'),
('기본 계약서 (샘플)','contract','[{"id":"parties","title":"계약 당사자","guidance":"실제 계약 주체"},{"id":"scope","title":"수행 범위","guidance":"포함·제외 범위"},{"id":"terms","title":"일정·대금·검수 조건","guidance":"합의한 조건"}]')
) AS v(name,kind,sections);
CREATE TRIGGER commercial_templates_immutable BEFORE UPDATE OR DELETE ON commercial_templates FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TRIGGER commercial_revisions_immutable BEFORE UPDATE OR DELETE ON commercial_document_revisions FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TRIGGER commercial_decisions_immutable BEFORE UPDATE OR DELETE ON commercial_decisions FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TRIGGER commercial_profiles_no_delete BEFORE DELETE ON commercial_profiles FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER commercial_documents_no_delete BEFORE DELETE ON commercial_documents FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER commercial_rewrites_no_delete BEFORE DELETE ON commercial_rewrites FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER commercial_feedback_no_delete BEFORE DELETE ON commercial_feedback FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE FUNCTION protect_commercial_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.document_id,NEW.source_revision_id,NEW.profile_version,NEW.input_snapshot,NEW.input_sha256,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.document_id,OLD.source_revision_id,OLD.profile_version,OLD.input_snapshot,OLD.input_sha256,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Commercial rewrite input is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status='needs_review' AND NEW.status NOT IN ('needs_review','applied','dismissed') THEN RAISE EXCEPTION 'Reviewed rewrite cannot return to execution' USING ERRCODE='23514'; END IF;
 IF OLD.status='running' AND NEW.status NOT IN ('running','needs_review','failed','uncertain') THEN RAISE EXCEPTION 'Running rewrite cannot be queued again' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('needs_review','failed','uncertain','applied','dismissed') AND ROW(NEW.result,NEW.trace_id,NEW.error_code,NEW.completed_at) IS DISTINCT FROM ROW(OLD.result,OLD.trace_id,OLD.error_code,OLD.completed_at) THEN RAISE EXCEPTION 'Commercial rewrite result is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('applied','dismissed') AND ROW(NEW.status,NEW.decision,NEW.applied_revision_id) IS DISTINCT FROM ROW(OLD.status,OLD.decision,OLD.applied_revision_id) THEN RAISE EXCEPTION 'Commercial rewrite decision is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('failed','uncertain') AND NEW.status<>OLD.status THEN RAISE EXCEPTION 'Failed rewrite requires a new request' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_rewrite_immutable BEFORE UPDATE ON commercial_rewrites FOR EACH ROW EXECUTE FUNCTION protect_commercial_rewrite();
CREATE FUNCTION protect_commercial_feedback() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.round,NEW.document_revision_id,NEW.request_text,NEW.requested_on,NEW.channel,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.round,OLD.document_revision_id,OLD.request_text,OLD.requested_on,OLD.channel,OLD.created_by,OLD.created_at) OR OLD.response_text IS NOT NULL THEN RAISE EXCEPTION 'Feedback records are immutable after response' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER commercial_feedback_immutable BEFORE UPDATE ON commercial_feedback FOR EACH ROW EXECUTE FUNCTION protect_commercial_feedback();
CREATE FUNCTION protect_commercial_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.project_id<>OLD.project_id OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Commercial changes require next version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_profile_version BEFORE UPDATE ON commercial_profiles FOR EACH ROW EXECUTE FUNCTION protect_commercial_version();
CREATE FUNCTION protect_commercial_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.kind,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.kind,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Commercial document identity is immutable' USING ERRCODE='23514'; END IF;
 IF NOT (OLD.latest_revision_id IS NULL AND NEW.latest_revision_id IS NOT NULL AND NEW.version=OLD.version) AND NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Commercial changes require next version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commercial_document_version BEFORE UPDATE ON commercial_documents FOR EACH ROW EXECUTE FUNCTION protect_commercial_document_version();
