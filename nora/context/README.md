# AINS Main Context native review flow

Verified against connected Nora MCP and published AINS API on 2026-10-12 (KST). This flow analyzes only the immutable project evidence selected by AINS. It does not collect Gmail/Drive/chat data, write memory, or commit project knowledge.

## Published flow

- Workspace: AINS (`t_ef2500ebb1b14058847dc513c5c197bc`). Tool calls require the workspace ID; the name was rejected by the current API.
- Flow: `ains-main-context-review-v1`, publication v4.
- Model: existing AINS OpenAI `gpt-5.4-mini`, reasoning `low`. No workspace default was changed.
- Execution: API trigger → evidence analysis → **native `requiresApproval:true` gate** → unchanged reviewed candidate returned.
- The second agent is the gated agent. A rejected gate skips the finalizer. The gate is not simulated by prompt text, AINS status polling, or a separate approval flow.
- No attached connectors, data sources, or memory spaces; automatic session creation is disabled. AINS supplies the permitted project evidence and frozen baseline.

## AINS integration contract

`request.schema.json` and `result.schema.json` are canonical. `contract.js` validates shapes, project/request/version identity, source IDs, literal evidence quotes, conflict target IDs, native approval identity, and exact equality of both agent outputs with the approved candidate.

The request includes `schema_version`, `request_id`, `project_id`, `domain_id`, `context_version`, source snapshots and current approved items. Each candidate records kind, title, content, explicit rationale, recorded alternatives, literal source evidence, affected current items, source certainty and scope assessment. Source certainty `agreed` describes what the source says; it is not application approval.

1. Authorize the AINS user and selected project/domain/sources.
2. Persist the immutable request, baseline version and source hashes before invocation.
3. Call `startContextReview(request, {expectedProjectId, token, signal})` from a worker. The published endpoint uses multipart `input` and `variables={context_request:request}`, with the raw token in `Authorization` (not Bearer).
4. Nora pauses before the finalizer. After the AINS webhook route is deployed, configure `set_approval_webhook_url` to the server-only capability route, then publish that changed flow. Until configured, use Nora's approval UI/MCP for synthetic tests only; the AINS application needs the callback to correlate pending approvals.
5. Authenticate the webhook route using the private route secret. Fetch the native approval using `getApproval(payload.id)` from the fixed workspace endpoint. Never follow arbitrary `decideUrl` input. Use `extractApprovalRequest` only to find the persisted job, then `validateApproval` with that exact stored request and trusted project ID.
6. Show the candidate, source excerpts and uncertainty to the authorized AINS reviewer. Before approval, recheck project membership, context version and source hashes.
7. `decideApproval` sends the reviewer decision to Nora's native gate. It verifies the native record first. The decision is first-writer-wins and retries must match reviewer, decision and reason. Approval IDs and decide URLs are bearer capabilities and must never be included in browser responses or logs.
8. When invocation returns, call `validateCompletedResult` with the persisted native approval and reviewed candidate. This requires completed status, both expected agent outputs, approved native gate and exact candidate equality.
9. AINS separately imports candidates and performs its final version-checked commit to Main Context. No model is authorized to save or approve its own claims.

Native approval REST responses are camelCase and omit `tenantId`; the fixed tenant-scoped endpoint binds it. MCP approval rows use snake_case. Actual approval `message` includes `# Original user request` and `# Upstream output (근거 분석 · Context 후보 작성)` sections rather than just a bare candidate JSON. The parser binds the exact original request before accepting the candidate.

## Failures and retry behavior

- Nora's JSON output rule was observed to be fail-soft: an invalid model result can still open a gate. AINS schema/evidence validation is the authoritative fail-closed boundary. The prompt includes an explicit seven-field JSON skeleton, but validation remains required.
- Malformed candidate content may be **rejected only** using `decideApproval(...,'rejected',...)` after the native gate identity and original request are verified. Approval still requires valid candidate content. A validator rejection should use a distinct system actor and a recorded reason.
- Model interpretation still needs human review. Literal citation validation prevents fabricated quotes but does not prove that every interpretation follows from the evidence.
- Network timeout, lost worker, missing webhook, changed source, or server restart is an unknown/stale execution state. Never automatically replay an invocation or treat a pending/partial result as a completed review.
- Nora documentation says an approval waits until decided, the run stops, or the server restarts. Durable native resume across restart has not been verified.
- `get_trace`/`list_traces` are available via authenticated MCP for operator reconciliation. A published-flow-token REST final-result lookup endpoint was not found or verified. The worker must retain the open invocation, and interrupted runs require reconciliation rather than fabricated completion.
- A source/context version change after approval blocks AINS import/commit and requires a fresh review.
- Nora UI approval outside AINS does not establish the application's own reviewer identity. AINS currently requires its own reviewer decision record before import.

## Capabilities checked, not yet connected

At inspection time AINS `list_connectors` and `list_knowledge_folders` both returned empty arrays. Existing memory spaces were diagnostic Evolution memory and the unrelated default session; neither was attached. No external customer messages or files were read for this work.

Nora's available tools support connector action/tool blocks and data sources using document folders/files, vector, full-text, hybrid and graph retrieval. Graph options include document allowlists, pinned revisions and as-of filtering. These are **available platform capabilities**, not working AINS ingestion or RAG connections. Project-scoped source bindings, access policy, approved-content publication and incremental index maintenance must be provisioned before claiming semantic retrieval or automatic channel ingestion.

Credentials are server-only in ignored `nora/.secrets/context-secret.json` (0600): trigger `token` and independent `webhookSecret`. Production secret provisioning and webhook activation are deployment steps owned by the application integration. Only this new flow now has its approval webhook configured; old flows are unchanged. The private callback URL is intentionally omitted from repository files. Application credential provisioning and end-to-end receiver verification remain separate deployment steps.

## Verification

Run `node --test tests/context-nora-contract.test.js` from the repository root: 38 tests pass.

Live synthetic checks:

- MCP invocation paused at the native gate; finalizer ran only after approval.
- Published REST invocation and HTTP capability approval completed with two outputs. Both outputs exactly matched the reviewed candidate.
- Published REST invocation rejected via MCP returned `status=partial`, `rawStatus=error`, one upstream output; finalizer did not run.
- HTTP approval lookup, exact source/identity binding, and final result validation passed.

Fixtures contain synthetic content only. Actual approval capability IDs are replaced with inert fixture values. Native callback delivery, production worker completion and server-restart recovery are not claimed by these tests.
