-- Language preferences are independent of immutable question/source history.
CREATE TABLE project_question_language_settings (
 project_id text PRIMARY KEY REFERENCES projects(id),
 customer_question_language text NOT NULL DEFAULT 'ko' CHECK(customer_question_language IN ('ko','en')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE project_questions ADD COLUMN language text CHECK(language IN ('ko','en'));
CREATE TABLE question_translations (
 id uuid PRIMARY KEY,project_id text NOT NULL,question_id uuid NOT NULL,
 source_question_version integer NOT NULL CHECK(source_question_version>0),
 original jsonb NOT NULL,language text NOT NULL CHECK(language IN ('ko','en')),
 status text NOT NULL CHECK(status IN ('running','draft','failed','uncertain')),
 title text,question text,trace_id text,flow_slug text,published_version_id text,error_code text,
 request_sha256 text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 UNIQUE(id,project_id),FOREIGN KEY(question_id,project_id) REFERENCES project_questions(id,project_id),
 CHECK(status<>'draft' OR (title IS NOT NULL AND question IS NOT NULL AND trace_id IS NOT NULL))
);
CREATE INDEX question_translations_source_idx ON question_translations(project_id,question_id,created_at DESC);
CREATE UNIQUE INDEX question_translations_running_idx ON question_translations(question_id) WHERE status='running';
ALTER TABLE question_deliveries ADD COLUMN translation_id uuid;
ALTER TABLE question_deliveries ADD CONSTRAINT question_deliveries_translation_fk FOREIGN KEY(translation_id,project_id) REFERENCES question_translations(id,project_id);
CREATE FUNCTION protect_question_translation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status<>'running' OR ROW(NEW.id,NEW.project_id,NEW.question_id,NEW.source_question_version,NEW.original,NEW.language,NEW.request_sha256,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.question_id,OLD.source_question_version,OLD.original,OLD.language,OLD.request_sha256,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Question translation snapshot is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER question_translation_immutable BEFORE UPDATE ON question_translations FOR EACH ROW EXECUTE FUNCTION protect_question_translation();
CREATE TRIGGER question_translation_no_delete BEFORE DELETE ON question_translations FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE FUNCTION protect_question_language() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.language IS DISTINCT FROM OLD.language THEN RAISE EXCEPTION 'Question language is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER question_language_immutable BEFORE UPDATE ON project_questions FOR EACH ROW EXECUTE FUNCTION protect_question_language();
CREATE FUNCTION protect_delivery_translation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.translation_id IS DISTINCT FROM OLD.translation_id THEN RAISE EXCEPTION 'Delivery translation source is immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER question_delivery_translation_immutable BEFORE UPDATE ON question_deliveries FOR EACH ROW EXECUTE FUNCTION protect_delivery_translation();
