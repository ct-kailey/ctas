-- A document has a stable business domain and identity; each revision retains its source history.
CREATE TABLE project_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  domain_pack jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,project_id)
);
CREATE UNIQUE INDEX project_domains_default_idx ON project_domains(project_id) WHERE is_default;
CREATE UNIQUE INDEX project_domains_name_idx ON project_domains(project_id,lower(name));
CREATE INDEX project_domains_project_idx ON project_domains(project_id,created_at,id);
INSERT INTO project_domains(project_id,name,domain_pack,is_default)
SELECT id,'기본 업무 영역',domain_pack,true FROM projects;

-- Also cover bootstrap and maintenance tools which create projects directly.
CREATE FUNCTION create_project_default_domain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO project_domains(project_id,name,domain_pack,is_default)
  VALUES(NEW.id,'기본 업무 영역',NEW.domain_pack,true);
  RETURN NEW;
END $$;
CREATE TRIGGER project_default_domain AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION create_project_default_domain();
ALTER TABLE documents ADD COLUMN domain_id uuid;
ALTER TABLE documents ADD COLUMN record_kind text NOT NULL DEFAULT 'specification'
  CHECK (record_kind IN ('specification','conversation','decision','work_item','note'));
UPDATE documents d SET domain_id=p.id FROM project_domains p WHERE p.project_id=d.project_id AND p.is_default;
ALTER TABLE documents ALTER COLUMN domain_id SET NOT NULL;
ALTER TABLE documents ADD CONSTRAINT documents_domain_fk FOREIGN KEY(domain_id,project_id) REFERENCES project_domains(id,project_id);
CREATE INDEX documents_domain_idx ON documents(project_id,domain_id,created_at DESC);
CREATE FUNCTION assign_document_default_domain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.domain_id IS NULL THEN
    SELECT id INTO NEW.domain_id FROM project_domains WHERE project_id=NEW.project_id AND is_default;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_default_domain BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION assign_document_default_domain();
CREATE FUNCTION protect_document_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.domain_id,NEW.record_kind,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.domain_id,OLD.record_kind,OLD.created_at) THEN
    RAISE EXCEPTION 'Document identity and domain are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_identity_immutable BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION protect_document_identity();
ALTER TABLE revisions ADD COLUMN history jsonb NOT NULL DEFAULT '{"source_type":"file","occurred_on":null,"decided_on":null,"source_created_at":null,"channel":null,"url":null,"external_id":null,"participants":[],"tags":[]}'::jsonb
  CHECK (jsonb_typeof(history)='object' AND history ? 'source_type' AND COALESCE(history->>'source_type','') IN ('file','editor','slack','azure_devops','teams','email','meeting','other'));
CREATE OR REPLACE FUNCTION protect_revision_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.document_id,NEW.filename,NEW.mime_type,NEW.sha256,NEW.content,NEW.created_by,NEW.created_at,NEW.history)
     IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.document_id,OLD.filename,OLD.mime_type,OLD.sha256,OLD.content,OLD.created_by,OLD.created_at,OLD.history) THEN
    RAISE EXCEPTION 'Revision source and history are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'ready' AND (NEW.document_json IS DISTINCT FROM OLD.document_json OR NEW.status <> 'ready') THEN
    RAISE EXCEPTION 'Ready revision is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
