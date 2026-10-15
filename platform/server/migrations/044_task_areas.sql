-- Area progress is independent of AI execution, code review and merge state.
CREATE TABLE automation_task_areas (
  task_id uuid NOT NULL,
  project_id text NOT NULL,
  area text NOT NULL CHECK (area IN ('screen','server','database')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','review','done','not_applicable')),
  description text NOT NULL DEFAULT '' CHECK (length(description)<=10000),
  reference text NOT NULL DEFAULT '' CHECK (length(reference)<=2000),
  version integer NOT NULL CHECK (version>0),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id,area),
  UNIQUE (task_id,project_id,area),
  FOREIGN KEY (task_id,project_id) REFERENCES automation_tasks(id,project_id)
);
CREATE INDEX automation_task_areas_project_idx ON automation_task_areas(project_id,task_id);
CREATE INDEX automation_task_areas_actor_idx ON automation_task_areas(updated_by);
CREATE INDEX automation_tasks_recent_project_idx ON automation_tasks(project_id,created_at DESC,id DESC);

CREATE TABLE automation_task_area_assignees (
  task_id uuid NOT NULL,
  project_id text NOT NULL,
  area text NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (task_id,area,user_id),
  FOREIGN KEY (task_id,project_id,area) REFERENCES automation_task_areas(task_id,project_id,area),
  FOREIGN KEY (project_id,user_id) REFERENCES memberships(project_id,user_id)
);
CREATE INDEX automation_task_area_assignees_member_idx ON automation_task_area_assignees(project_id,user_id);

CREATE TABLE automation_task_area_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  project_id text NOT NULL,
  area text NOT NULL,
  version integer NOT NULL CHECK (version>0),
  changed_fields jsonb NOT NULL CHECK (jsonb_typeof(changed_fields)='array'),
  before_state jsonb NOT NULL CHECK (jsonb_typeof(before_state)='object'),
  after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state)='object'),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id,area,version),
  FOREIGN KEY (task_id,project_id,area) REFERENCES automation_task_areas(task_id,project_id,area)
);
CREATE INDEX automation_task_area_history_recent_idx ON automation_task_area_history(project_id,task_id,created_at DESC,id DESC);
CREATE INDEX automation_task_area_history_actor_idx ON automation_task_area_history(actor_id);
CREATE TRIGGER automation_task_area_history_immutable BEFORE UPDATE OR DELETE ON automation_task_area_history FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

CREATE FUNCTION protect_task_area_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.task_id,NEW.project_id,NEW.area) IS DISTINCT FROM ROW(OLD.task_id,OLD.project_id,OLD.area)
    OR NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'Task area identity and version must be preserved' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER automation_task_area_identity BEFORE UPDATE ON automation_task_areas FOR EACH ROW EXECUTE FUNCTION protect_task_area_identity();
CREATE TRIGGER automation_task_area_no_delete BEFORE DELETE ON automation_task_areas FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();

CREATE FUNCTION protect_task_area_assignee_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE project_id=NEW.project_id AND user_id=NEW.user_id AND role IN ('owner','reviewer','member') FOR SHARE) THEN
    RAISE EXCEPTION 'Task area assignees must be project contributors' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER automation_task_area_assignee_role BEFORE INSERT OR UPDATE ON automation_task_area_assignees FOR EACH ROW EXECUTE FUNCTION protect_task_area_assignee_role();

CREATE FUNCTION protect_active_task_area_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role='viewer' AND OLD.role<>'viewer' AND EXISTS (
    SELECT 1 FROM automation_task_area_assignees a
    JOIN automation_task_areas t ON t.task_id=a.task_id AND t.project_id=a.project_id AND t.area=a.area
    WHERE a.project_id=NEW.project_id AND a.user_id=NEW.user_id AND t.status NOT IN ('done','not_applicable')
  ) THEN
    RAISE EXCEPTION 'Active task areas must be reassigned before read-only membership' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER membership_active_task_area BEFORE UPDATE OF role ON memberships FOR EACH ROW EXECUTE FUNCTION protect_active_task_area_member();
