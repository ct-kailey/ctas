-- Operational task state is separate from immutable Nora plans and code execution authorization.
CREATE TABLE work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  plan_id uuid NOT NULL,
  source_task_id text NOT NULL CHECK(source_task_id ~ '^TASK-([1-9]|1[0-9]|20)$'),
  source_task jsonb NOT NULL CHECK(jsonb_typeof(source_task)='object' AND source_task->>'id'=source_task_id),
  status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','qa','done')),
  assignee_id uuid,
  due_on date CHECK(due_on BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  blocker text NOT NULL DEFAULT '' CHECK(length(blocker)<=2000),
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,project_id),
  UNIQUE(plan_id,source_task_id),
  FOREIGN KEY(plan_id,project_id) REFERENCES implementation_plans(id,project_id),
  FOREIGN KEY(project_id,assignee_id) REFERENCES memberships(project_id,user_id),
  CHECK((status='blocked' AND length(btrim(blocker))>0) OR (status<>'blocked' AND blocker=''))
);
CREATE INDEX work_items_project_idx ON work_items(project_id,created_at DESC,id);
CREATE INDEX work_items_assignment_idx ON work_items(project_id,assignee_id,status,due_on);
CREATE INDEX work_items_open_due_idx ON work_items(project_id,due_on,id) WHERE status<>'done';
CREATE INDEX work_items_creator_idx ON work_items(created_by);

CREATE TABLE work_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES projects(id),
  work_item_id uuid NOT NULL,
  version bigint NOT NULL CHECK(version>0),
  kind text NOT NULL CHECK(kind IN ('imported','updated')),
  actor_id uuid NOT NULL REFERENCES users(id),
  note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 2000),
  qa_evidence text CHECK(qa_evidence IS NULL OR length(btrim(qa_evidence)) BETWEEN 1 AND 5000),
  before_state jsonb CHECK(before_state IS NULL OR jsonb_typeof(before_state)='object'),
  after_state jsonb NOT NULL CHECK(jsonb_typeof(after_state)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(work_item_id,version),
  FOREIGN KEY(work_item_id,project_id) REFERENCES work_items(id,project_id)
);
CREATE INDEX work_item_events_project_idx ON work_item_events(project_id,created_at DESC,id);
CREATE INDEX work_item_events_actor_idx ON work_item_events(actor_id);
CREATE FUNCTION protect_work_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.plan_id,NEW.source_task_id,NEW.source_task,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.plan_id,OLD.source_task_id,OLD.source_task,OLD.created_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Work item source is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'Work item updates require the next version' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER work_item_immutable BEFORE UPDATE ON work_items FOR EACH ROW EXECUTE FUNCTION protect_work_item();
CREATE TRIGGER work_item_no_delete BEFORE DELETE ON work_items FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER work_item_events_append_only BEFORE UPDATE OR DELETE ON work_item_events FOR EACH ROW EXECUTE FUNCTION protect_event_history();
