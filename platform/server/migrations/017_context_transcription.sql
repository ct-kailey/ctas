CREATE TABLE context_transcriptions (
 id uuid PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 domain_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300),
 occurred_at timestamptz NOT NULL,
 channel text NOT NULL CHECK(length(channel) BETWEEN 1 AND 200),
 filename text NOT NULL,
 mime_type text NOT NULL,
 audio bytea NOT NULL CHECK(octet_length(audio) BETWEEN 1 AND 20971520),
 audio_sha256 text NOT NULL CHECK(audio_sha256 ~ '^[a-f0-9]{64}$'),
 request_sha256 text NOT NULL,
 language text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','ready','reviewed','failed','uncertain','cancelled')),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 10),
 worker_id uuid,
 heartbeat_at timestamptz,
 original_transcript jsonb,
 original_sha256 text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,project_id),
 FOREIGN KEY(domain_id,project_id) REFERENCES project_domains(id,project_id),
 CHECK((original_transcript IS NULL)=(original_sha256 IS NULL)),
 CHECK(status NOT IN ('ready','reviewed') OR original_transcript IS NOT NULL)
);
CREATE INDEX context_transcription_project_idx ON context_transcriptions(project_id,created_at DESC,id);
CREATE INDEX context_transcription_queue_idx ON context_transcriptions(created_at,id) WHERE status='queued';
CREATE INDEX context_transcription_lease_idx ON context_transcriptions(heartbeat_at) WHERE status='running';
CREATE INDEX context_transcription_creator_idx ON context_transcriptions(created_by);
CREATE INDEX context_transcription_domain_idx ON context_transcriptions(domain_id,project_id);
CREATE TABLE context_transcription_attempts (
 id uuid PRIMARY KEY,
 transcription_id uuid NOT NULL,
 project_id text NOT NULL,
 attempt integer NOT NULL,
 model text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','ready','failed','uncertain','cancelled')),
 provider_request_id text,
 error_code text,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 UNIQUE(transcription_id,attempt),
 FOREIGN KEY(transcription_id,project_id) REFERENCES context_transcriptions(id,project_id)
);
CREATE INDEX context_transcription_attempt_project_idx ON context_transcription_attempts(project_id,transcription_id);
CREATE TABLE context_transcription_reviews (
 id uuid PRIMARY KEY,
 transcription_id uuid NOT NULL UNIQUE,
 project_id text NOT NULL,
 reviewed_by uuid NOT NULL REFERENCES users(id),
 original_sha256 text NOT NULL,
 request_sha256 text NOT NULL,
 edited_text text NOT NULL CHECK(length(edited_text) BETWEEN 1 AND 40000),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 5000),
 segment_ids jsonb NOT NULL,
 candidate_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(transcription_id,project_id) REFERENCES context_transcriptions(id,project_id),
 FOREIGN KEY(candidate_id,project_id) REFERENCES context_candidates(id,project_id)
);
CREATE INDEX context_transcription_review_project_idx ON context_transcription_reviews(project_id,created_at DESC);
CREATE INDEX context_transcription_reviewer_idx ON context_transcription_reviews(reviewed_by);
CREATE FUNCTION protect_transcription_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.project_id,NEW.domain_id,NEW.created_by,NEW.title,NEW.occurred_at,NEW.channel,NEW.filename,NEW.mime_type,NEW.audio,NEW.audio_sha256,NEW.request_sha256,NEW.language,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.domain_id,OLD.created_by,OLD.title,OLD.occurred_at,OLD.channel,OLD.filename,OLD.mime_type,OLD.audio,OLD.audio_sha256,OLD.request_sha256,OLD.language,OLD.created_at) THEN
 RAISE EXCEPTION 'Transcription source is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.original_transcript IS NOT NULL AND ROW(NEW.original_transcript,NEW.original_sha256) IS DISTINCT FROM ROW(OLD.original_transcript,OLD.original_sha256) THEN
 RAISE EXCEPTION 'Original transcript is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER transcription_source_immutable BEFORE UPDATE ON context_transcriptions FOR EACH ROW EXECUTE FUNCTION protect_transcription_snapshot();
CREATE TRIGGER transcription_no_delete BEFORE DELETE ON context_transcriptions FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER transcription_review_immutable BEFORE UPDATE OR DELETE ON context_transcription_reviews FOR EACH ROW EXECUTE FUNCTION protect_event_history();
CREATE TRIGGER transcription_attempt_no_delete BEFORE DELETE ON context_transcription_attempts FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE FUNCTION protect_transcription_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.transcription_id,NEW.project_id,NEW.attempt,NEW.model,NEW.started_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.transcription_id,OLD.project_id,OLD.attempt,OLD.model,OLD.started_at) OR
 (OLD.status<>'running' AND NEW IS DISTINCT FROM OLD) THEN
 RAISE EXCEPTION 'Transcription execution history is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER transcription_attempt_immutable BEFORE UPDATE ON context_transcription_attempts FOR EACH ROW EXECUTE FUNCTION protect_transcription_attempt();
