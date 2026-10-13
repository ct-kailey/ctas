"""Generate the checked-in JSON contracts without third-party dependencies."""
import json
from pathlib import Path

OUT = Path(__file__).parent
STR = {"type": "string", "minLength": 1}
STRINGS = {"type": "array", "items": {"type": "string"}}
def obj(properties, required=None, extra=False):
    return {"type": "object", "properties": properties,
            "required": list(properties) if required is None else required,
            "additionalProperties": extra}
def enum(*values):
    return {"type": "string", "enum": list(values)}
locator = obj({"kind": enum("page", "slide", "sheet", "paragraph", "text"), "label": STR})
nullable_key = {"type": ["string", "null"]}
segment = obj({"segment_id": STR, "requirement_key": nullable_key, "text": STR,
               "locator": locator, "extraction_status": enum("ok", "needs_review"),
               "normalized_text": {"type":"string"}},
              ["segment_id","requirement_key","text","locator","extraction_status"])
document = obj({"schema_version": {"const":"1.0"}, "project_id": STR,
                "document_id": STR,"revision_id": STR,
                "source": obj({"filename":STR,"mime_type":STR,"sha256":{"type":"string","pattern":"^[0-9a-f]{64}$"}}),
                "segments":{"type":"array","minItems":1,"maxItems":200,"items":segment},
                "extraction":obj({"complete":{"type":"boolean"},"warnings":STRINGS}),
                "normalization":obj({"status":enum("ready","needs_review"),"warnings":STRINGS,"segment_count":{"type":"integer","minimum":1}})},
               ["schema_version","project_id","document_id","revision_id","source","segments","extraction"])
kind = enum("screen","api","database","test","document","other")
request = obj({"schema_version":{"const":"1.0"},"request_id":STR,"project_id":STR,
               "baseline":document,"current":document,
               "domain_pack":obj({"id":STR,"version":STR,"glossary":{"type":"array","items":{"type":"object"}}}),
               "impact_map":{"type":"array","maxItems":200,"items":obj({"requirement_key":STR,"targets":{"type":"array","items":obj({"kind":kind,"ref":STR})}})}})
ev = obj({"segment_id":STR,"text":STR,"locator":locator})
change = obj({"change_id":STR,"requirement_key":nullable_key,
              "change_type":enum("added","removed","modified","editorial","uncertain"),
              "risk":enum("low","medium","high"),"summary":STR,
              "before":{"anyOf":[ev,{"type":"null"}]},"after":{"anyOf":[ev,{"type":"null"}]},
              "reason":STR,"impacts":{"type":"array","items":obj({"kind":kind,"ref":STR,"basis":enum("provided","inferred"),"reason":STR})}})
response = obj({"schema_version":{"const":"1.0"},"request_id":STR,"project_id":STR,
                "status":enum("needs_review","no_change","blocked"),
                "changes":{"type":"array","maxItems":400,"items":change},
                "questions":{"type":"array","maxItems":400,"items":obj({"question_id":STR,"related_change_ids":STRINGS,"question":STR,"options":STRINGS,"requires_customer_decision":{"const":True}})},
                "warnings":STRINGS,"approval":obj({"status":{"const":"not_requested"},"baseline_publication_allowed":{"const":False}})})
for name, schema in [("document",document),("change-review-request",request),("change-review-result",response)]:
    schema = {"$schema":"https://json-schema.org/draft/2020-12/schema","title":name,"version":"1.0",**schema}
    (OUT/f"{name}.schema.json").write_text(json.dumps(schema,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
