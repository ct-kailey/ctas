-- Classification describes a document's purpose without changing the processing
-- kind or treating an uploaded contract as an approved commercial agreement.
ALTER TABLE documents ADD COLUMN document_category text
  CHECK (document_category IN ('proposal','estimate','contract','requirements','planning','policy','meeting','conversation','other'));
UPDATE documents SET document_category = CASE record_kind
  WHEN 'specification' THEN 'requirements'
  WHEN 'conversation' THEN 'conversation'
  ELSE 'other' END;
ALTER TABLE documents ALTER COLUMN document_category SET NOT NULL;

-- Existing importers may omit classification; derive the same legacy fallback.
CREATE OR REPLACE FUNCTION assign_document_default_domain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.domain_id IS NULL THEN
    SELECT id INTO NEW.domain_id FROM project_domains WHERE project_id=NEW.project_id AND is_default;
  END IF;
  IF NEW.document_category IS NULL THEN
    NEW.document_category := CASE NEW.record_kind
      WHEN 'specification' THEN 'requirements'
      WHEN 'conversation' THEN 'conversation'
      ELSE 'other' END;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_document_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.project_id,NEW.domain_id,NEW.record_kind,NEW.document_category,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.project_id,OLD.domain_id,OLD.record_kind,OLD.document_category,OLD.created_at) THEN
    RAISE EXCEPTION 'Document identity, domain and classification are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
