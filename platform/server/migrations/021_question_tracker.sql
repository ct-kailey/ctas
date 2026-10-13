CREATE TABLE project_questions (
 id uuid PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id),
 title text NOT NULL, question text NOT NULL, recipient text NOT NULL, channel text NOT NULL,
 assigned_to uuid NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 asked_by text NOT NULL DEFAULT '', asked_at timestamptz, waiting_since timestamptz, due_at timestamptz,
 blocking boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','waiting','answered_pending','resolved','cancelled')),
 source_refs jsonb NOT NULL DEFAULT '[]',
 answer jsonb, resolution jsonb, context_candidate_id uuid,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), request_sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id), FOREIGN KEY(project_id,assigned_to) REFERENCES memberships(project_id,user_id),
 FOREIGN KEY(context_candidate_id,project_id) REFERENCES context_candidates(id,project_id),
 CHECK(status NOT IN ('waiting','answered_pending','resolved') OR asked_at IS NOT NULL)
);
CREATE INDEX project_questions_waiting_idx ON project_questions(project_id,status,due_at);
CREATE INDEX project_questions_assigned_idx ON project_questions(project_id,assigned_to,status);
CREATE TABLE question_work_items (
 project_id text NOT NULL,question_id uuid NOT NULL,work_item_id uuid NOT NULL,
 PRIMARY KEY(question_id,work_item_id),
 FOREIGN KEY(question_id,project_id) REFERENCES project_questions(id,project_id),
 FOREIGN KEY(work_item_id,project_id) REFERENCES work_items(id,project_id)
);
CREATE INDEX question_work_items_work_idx ON question_work_items(project_id,work_item_id);
CREATE TABLE question_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id text NOT NULL,
 question_id uuid NOT NULL,version integer NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(question_id,version),FOREIGN KEY(question_id,project_id) REFERENCES project_questions(id,project_id)
);
CREATE INDEX question_events_project_idx ON question_events(project_id,created_at DESC);
CREATE TRIGGER question_events_immutable BEFORE UPDATE OR DELETE ON question_events FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TABLE question_reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id text NOT NULL,question_id uuid NOT NULL,
 question_version integer NOT NULL,day_key date NOT NULL,assigned_to uuid NOT NULL,
 detail jsonb NOT NULL,acknowledged_at timestamptz,acknowledged_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(question_id,question_version,day_key),
 FOREIGN KEY(question_id,project_id) REFERENCES project_questions(id,project_id)
);
CREATE INDEX question_reminders_pending_idx ON question_reminders(project_id,assigned_to,created_at DESC) WHERE acknowledged_at IS NULL;
CREATE TABLE question_outbound_settings (
 project_id text NOT NULL REFERENCES projects(id),provider text NOT NULL CHECK(provider IN ('slack','gmail')),
 enabled boolean NOT NULL DEFAULT false,allowed_recipients jsonb NOT NULL DEFAULT '[]',
 secret_envelope jsonb,version integer NOT NULL DEFAULT 1,updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,provider)
);
CREATE TABLE question_deliveries (
 id uuid PRIMARY KEY,project_id text NOT NULL,question_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('question','follow_up','response')),provider text NOT NULL CHECK(provider IN ('slack','gmail')),
 recipient text NOT NULL,subject text NOT NULL,body text NOT NULL,
 question_version integer NOT NULL,settings_version integer NOT NULL,
 content_sha256 text NOT NULL,request_sha256 text NOT NULL,created_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','sending','sent','rejected','failed','uncertain')),
 review jsonb,result jsonb,sending_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(question_id,project_id) REFERENCES project_questions(id,project_id)
);
CREATE INDEX question_deliveries_project_idx ON question_deliveries(project_id,created_at DESC);
CREATE INDEX question_deliveries_question_idx ON question_deliveries(question_id,project_id);
CREATE INDEX question_deliveries_sending_idx ON question_deliveries(sending_at) WHERE status='sending';
CREATE FUNCTION protect_question_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.question_id,NEW.kind,NEW.provider,NEW.recipient,NEW.subject,NEW.body,NEW.question_version,NEW.settings_version,NEW.content_sha256,NEW.request_sha256,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.question_id,OLD.kind,OLD.provider,OLD.recipient,OLD.subject,OLD.body,OLD.question_version,OLD.settings_version,OLD.content_sha256,OLD.request_sha256,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Delivery content is immutable; create a new reviewed draft' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('sent','rejected','failed') THEN RAISE EXCEPTION 'Delivery is terminal' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER question_delivery_immutable BEFORE UPDATE ON question_deliveries FOR EACH ROW EXECUTE FUNCTION protect_question_delivery();
CREATE TRIGGER question_delivery_no_delete BEFORE DELETE ON question_deliveries FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

CREATE FUNCTION protect_question_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.title,NEW.question,NEW.created_by,NEW.request_sha256,NEW.created_at,NEW.source_refs)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.title,OLD.question,OLD.created_by,OLD.request_sha256,OLD.created_at,OLD.source_refs) THEN RAISE EXCEPTION 'Original question is immutable' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.recipient,NEW.channel,NEW.assigned_to,NEW.asked_by,NEW.asked_at,NEW.waiting_since,NEW.due_at,NEW.blocking,NEW.status,NEW.answer,NEW.resolution,NEW.updated_at)
 IS DISTINCT FROM ROW(OLD.recipient,OLD.channel,OLD.assigned_to,OLD.asked_by,OLD.asked_at,OLD.waiting_since,OLD.due_at,OLD.blocking,OLD.status,OLD.answer,OLD.resolution,OLD.updated_at) THEN
  IF NEW.version<>OLD.version+1 OR OLD.status IN ('resolved','cancelled') THEN RAISE EXCEPTION 'Question changes require next version and an open question' USING ERRCODE='23514'; END IF;
 ELSIF NEW.version<>OLD.version THEN RAISE EXCEPTION 'Question version changed without history' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER project_question_version BEFORE UPDATE ON project_questions FOR EACH ROW EXECUTE FUNCTION protect_question_record();
CREATE TRIGGER project_question_no_delete BEFORE DELETE ON project_questions FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
