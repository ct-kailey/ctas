-- Keep approved answer evidence pinned even if a future API bypasses ledger methods.
CREATE FUNCTION protect_answer_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE review_decision jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW.review_id,NEW.question_id) IS DISTINCT FROM ROW(OLD.review_id,OLD.question_id) THEN
    RAISE EXCEPTION 'Answer identity is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT decision INTO review_decision FROM reviews WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.review_id ELSE NEW.review_id END FOR UPDATE;
  IF review_decision IS NOT NULL THEN
    RAISE EXCEPTION 'Decided answer evidence is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER answer_decision_immutable BEFORE INSERT OR UPDATE OR DELETE ON answers FOR EACH ROW EXECUTE FUNCTION protect_answer_snapshot();
CREATE FUNCTION protect_snapshot_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable evidence cannot be deleted' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER revision_no_delete BEFORE DELETE ON revisions FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
CREATE TRIGGER review_no_delete BEFORE DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION protect_snapshot_delete();
