# AINS SI/SM Document Intake v1

Nora published pipeline (version 1): `pipe_69176e8b946449329ab1a98b927b66cf` in AINS workspace `t_ef2500ebb1b14058847dc513c5c197bc`.

The graph is `Document Envelope API → Validate Document Envelope → Preserve and Normalize Text`. It uses no LLM, external HTTP, storage sink, or source-file upload. Binary extraction belongs to the local adapter.

Input is exactly one Document envelope matching `../schemas/document.schema.json`. Output is that envelope with each original `text` preserved, `normalized_text` added, and `normalization: {status, warnings, segment_count}`. Only line endings and whitespace are normalized. Numbers, units, operators, and compatibility characters are retained.

Nora `enr_script` receives each input record in the global `args`; returned fields shallow-merge into that record. The final record is serialized in `report.final_output`. A single-record exception fails the draft invocation. The actual MCP invocation returned an inline report despite its older asynchronous tool description. `test_pipeline_block` returned empty reports and must not be used as success evidence.

## Required caller boundary

The trusted caller must authenticate project access and reject array input before invoking Nora. Nora splits arrays into records and can report overall success after a record failed. The caller must reject a response if **any stage has `artifacts.failed > 0`**, or if final output is an array, contains `script_error`, lacks `normalization`, fails the Document schema, or changes source identity/original text. The final normalizer repeats validation to avoid marking a failed record `ready`.

Keep the bearer token only in the server-side adapter. A project ID and a SHA-256-shaped field are not proof of user authorization, original-byte integrity, or extraction fidelity. This pipeline does not provide persistent deduplication or a document ledger.

## Files and validation

- `validate-document.js`: first script node body.
- `normalize-document.js`: whitespace normalization logic.
- `normalize-block.js`: deployed last node body, validator prepended in an IIFE.
- `manifest.json`: node handles, runtime contract, and caller requirements.
- `draft-snapshot.json`: graph read back after updates; contains no bearer secret.
- `evidence.json`: actual Nora draft runs, assertion results, and the mixed-array limitation.
- `synthetic-document.json`: synthetic test input only.

Run `node nora/pipeline/test-pipeline.cjs` from the repository root. If validation changes, regenerate `normalize-block.js`, update both remote script nodes, test the draft, and read back the snapshot before publishing. Publication and bearer provisioning are handled by the root task; the saved draft manifest records the state at this handoff.

## Final publication verification

Published version 1. The bearer-authenticated REST endpoint in `manifest.json` returned HTTP 200, run `647956d2-85d4-43a5-99a3-b9b29584e58b`. Both stages reported zero failed records and the strict consumer contract accepted the response. See `http-smoke-response.json` and `published-smoke.json`. The historical draft snapshot remains a pre-publication artifact. The bearer token is held only in gitignored `../.secrets/pipeline-secret.json` (0600).
