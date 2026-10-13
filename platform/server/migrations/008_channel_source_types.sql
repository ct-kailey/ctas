ALTER TABLE revisions DROP CONSTRAINT revisions_history_check;
ALTER TABLE revisions ADD CONSTRAINT revisions_history_check CHECK (
  jsonb_typeof(history)='object' AND history ? 'source_type' AND
  COALESCE(history->>'source_type','') IN ('file','editor','slack','azure_devops','teams','kakaotalk','discord','email','meeting','other')
);
