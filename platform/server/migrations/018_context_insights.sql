CREATE TABLE context_insights (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id text NOT NULL REFERENCES projects(id),
 kind text NOT NULL,
 fingerprint text NOT NULL CHECK(length(fingerprint)=64),
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','resolved','converted')),
 candidate_id uuid,
 decision jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,fingerprint),
 FOREIGN KEY(candidate_id,project_id) REFERENCES context_candidates(id,project_id)
);
CREATE INDEX context_insights_project_state_idx ON context_insights(project_id,status,created_at DESC);
CREATE INDEX context_insights_candidate_idx ON context_insights(candidate_id,project_id);
CREATE TABLE context_insight_scans (
 project_id text PRIMARY KEY REFERENCES projects(id),
 last_scanned_at timestamptz NOT NULL DEFAULT now(),
 checked_items integer NOT NULL DEFAULT 0,
 error_code text
);
CREATE TABLE context_daily_briefs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id text NOT NULL REFERENCES projects(id),
 window_start timestamptz NOT NULL,
 window_end timestamptz NOT NULL,
 content_sha256 text NOT NULL,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,window_end,content_sha256),
 CHECK(window_end>window_start)
);
CREATE INDEX context_daily_briefs_project_idx ON context_daily_briefs(project_id,window_end DESC);
CREATE TRIGGER context_daily_briefs_immutable BEFORE UPDATE OR DELETE ON context_daily_briefs FOR EACH ROW EXECUTE FUNCTION protect_event_history();
