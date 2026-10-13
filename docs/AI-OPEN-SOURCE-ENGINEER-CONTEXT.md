# AI Open Source Engineer — Durable Project Context

Last reviewed: 2026-10-14
Repository: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-
Default branch: `main`
Purpose: persistent handoff record for future work. Read this document and `PROJECT_STATUS_AND_ROADMAP.md` before making changes; do not rely only on chat history.

## 1. Product goal

Build an AI-assisted open-source contribution engineer that helps a human move from discovering a suitable GitHub issue to a concrete, reviewed, tested contribution proposal. The product should analyze an issue and repository, plan a change, generate actual file contents, run safe checks, review the diff, show evidence and risks, and wait for explicit human approval before writing changes to the user's fork. Pull-request creation remains a separate explicit user action.

Truthfulness is a hard requirement: never claim a real test, OAuth flow, Docker run, commit, PR, or deployment succeeded unless the result was actually observed. Distinguish automated/mocked tests from real live integrations.

## 2. Repository and stack

- Repository: `thakareatharv49-svg/AI-OpenSource-Engineer-` (the trailing hyphen is part of the repository name).
- Main branch: `main`.
- Frontend: React + TypeScript + Vite + React Router.
- Backend: Node.js + Express + TypeScript.
- Integrations: GitHub REST API; AI providers include Gemini, OpenAI, and local Ollama depending on configuration.
- Core implementation is under `client/` and `server/`; operational and sandbox documentation is under `docs/`.
- Roadmap/status source: `PROJECT_STATUS_AND_ROADMAP.md`.
- Production operations runbook: `docs/production-operations.md`.
- Sandbox runbook: `docs/isolated-sandbox.md`.

## 3. Implemented capability inventory

### Issue discovery and proposal workflow
- Discover GitHub issues and use AI-assisted issue selection.
- Analyze issue context and relevant upstream repository files.
- Rank likely relevant source, tests, and build manifests under explicit file/byte budgets; exclude generated, binary, lockfile, and secret-like paths.
- Produce implementation plans and concrete proposed file contents.
- Review proposed changes with AI and deterministic quality/safety checks.
- UI supports reviewing and approving a proposal before contribution writes.
- Proposal commits use actual file content, not a JSON description.
- Fork/branch/commit/PR preparation is scoped to the authenticated user's GitHub identity and fork. PR creation is separate and explicit.

### Atomic contribution commits
- `POST /api/github/commit-proposal` validates repository identifiers, branch ref, commit message, payload shape, proposal size/path/content safety, authenticated identity, and fork ownership.
- Uses Git Data API to prepare blobs/tree/commit, then advances the branch with a non-force ref update.
- Preparation failures should not advance the branch; concurrent updates should fail instead of overwriting a newer head.
- Idempotency metadata supports recovery after a lost commit response.

### Isolated sandbox checks
- Opt-in Docker-backed fixed-check runner for Node/Python with cancellation and bounded output.
- Host input is read-only at `/input`; each run gets a bounded temporary workspace. Runner hardening includes disabled networking, read-only root, dropped capabilities, no-new-privileges, non-root execution, and resource/time/output limits.
- Repository snapshots are bounded and prioritize manifests/tests; proposed changes are overlaid before checks.
- Dependency installation is intentionally disabled; this is not a full clone and large/truncated GitHub trees may omit files.
- CI process tests are mocked. A real Docker smoke test on the target machine remains unverified.

### Authentication and security
- GitHub OAuth authorization-code flow with random state validation.
- Opaque HttpOnly/SameSite session cookie; GitHub access tokens stay server-side; session lifetime is eight hours.
- Authenticated GitHub writes check identity and fork ownership.
- Configured CORS allowlist, request-size limits, input validation, security headers, Host-header guard, structured audit events, prompt-injection defensive framing, and deterministic proposal safety checks.
- Sensitive values, prompts, and source content should not be logged.
- Backend binds to loopback by default. The non-loopback/public bind guard must stay enabled until live deployment verification and security review are completed.

### Lifecycle, reliability, and quality
- User-scoped lifecycle API records contribution stages, legal transitions, version checks, idempotency keys, retry/cancel state, and bounded event history.
- Local JSON persistence uses atomic writes and private permissions; browser restoration does not persist OAuth tokens.
- Milestone 5 added issue-aware repository context selection, proposal structural validation, deterministic safety findings, and AI/provider/review telemetry.
- Milestone 6 adds shared Redis-backed lifecycle compare-and-set state, shared OAuth sessions and one-time OAuth state, distributed burst/daily quotas, bounded operational events, and production configuration gates.

## 4. Milestone record

### Milestone 1 — contribution commit reliability
Implementation merged. Atomic proposal commit endpoint, validation, non-force branch update, frontend integration, tests for multi-file atomic commit and preparation failure. A live authenticated issue-to-commit run is still not confirmed.

### Milestone 2 — isolated test execution
Implementation merged. Opt-in Docker runner, cancellation, bounded output/workspace, hardened container settings, bounded GitHub repository snapshot and UI integration. Real Docker smoke test remains pending.

### Milestone 3 — authentication and deployment security
OAuth/session foundation and per-user GitHub operations implemented. Deployment intentionally remained loopback-only while state/rate limits were process-local; the later Milestone 6 shared-state work addresses much of that design gap. Live OAuth remains unverified.

### Milestone 4 — recovery and contribution lifecycle
Lifecycle state machine, authenticated/user-scoped endpoints, optimistic concurrency, idempotency, retry/cancel, durable local JSON storage, browser refresh restoration, and duplicate-commit recovery added. Live OAuth + Docker end-to-end recovery still pending.

### Milestone 5 — code quality and scalable execution
Merged in PRs #17 and #18. Issue-aware bounded repository context, generated proposal quality gate, deterministic safety findings, AI/provider/review telemetry, and regression tests. Real-task evaluation and live integrations remain separate verification tasks.

### Milestone 6 — production readiness/shared security controls
Merged in PRs #20 and #21:
- PR #20: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/20
- Merge commit: `146d9a14a532b8d20fd7ebbb7a5c9b6fff763dff`
- PR #21: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/21
- Merge commit / current main at last review: `20d313521a4eadae361974d3f42948f5ba8d4a8a`
- Post-merge CI run: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/actions/runs/38454462425 (success).
- PR #20's verification reported backend typecheck and 77 backend tests passing, plus frontend build/lint; post-merge CI passed.
- PR #21 persists quality-gate and review-verdict metrics in bounded Redis operational events and adds the production operations/incident runbook.
- Redis REST integration uses HTTPS-only URLs; shared quotas use atomic Lua increments; shared lifecycle state uses compare-and-set with conflict retries; OAuth state is one-time/TTL-bound; sessions expire after eight hours; operational events are bounded to 5,000 entries and a 30-day TTL.
- Production configuration requires OAuth credentials, HTTPS URLs/origins, shared Redis configuration, and sandbox disabled.
- **Not verified live:** real Redis concurrency/restart behavior, real GitHub OAuth, authenticated fork/commit workflow, backup/restore drill, adversarial security review, and Docker smoke test. The public/non-loopback bind guard remains active.

## 5. Current state and next work

As of 2026-10-14, main was at `20d313521a4eadae361974d3f42948f5ba8d4a8a`, with Milestone 6 implementation merged. The next work should close Milestone 6 verification gaps rather than declaring a new milestone complete.

Recommended verification order:
1. Inspect current main and CI before editing; never assume the recorded SHA is still current.
2. Run the documented local Docker smoke test with Docker Desktop and the sandbox explicitly enabled only for the test, then disable it again.
3. Test shared Redis sessions, one-time OAuth state, quota increments, lifecycle CAS/concurrency, restart recovery, TTL/retention, and failure-closed behavior against a real disposable Redis service.
4. Run GitHub OAuth login/logout and a controlled authenticated contribution flow against a test fork.
5. Conduct backup/restore drill and adversarial security review; verify no secrets or prompt/source contents leak into logs.
6. Update this document and `PROJECT_STATUS_AND_ROADMAP.md` with evidence, dates, exact CI/live results, and remaining gaps.
7. Keep the non-loopback bind guard active until the production release gates actually pass.

Do not claim live integration completion from mocked tests. Do not disable the public-bind guard merely to make deployment start.

## 6. Working protocol and user preferences

- Work directly in GitHub when repository tools permit; user expects the assistant to implement changes, inspect checks, merge the PR when checks pass, and verify post-merge CI.
- **Do not tell the user to merge a PR.** If a PR is ready and CI is green, merge it yourself; if checks fail, diagnose and fix the issue rather than hand it back.
- Work one milestone at a time. Finish and verify the current milestone/gates before advancing.
- The user often says “do next” to continue the current project. Interpret that as continuing the current open milestone/gap, not skipping ahead.
- Preserve existing working behavior and keep changes focused, tested, and documented.
- Report exact PRs, merge commits, CI evidence, what is complete, and what is still unverified.
- Avoid claiming work was performed when tools did not actually make/verify the change.
- Never include credentials, tokens, private environment values, or other secrets in the persistent notes.

## 7. Key references

- Project roadmap/status: `PROJECT_STATUS_AND_ROADMAP.md`
- Production runbook: `docs/production-operations.md`
- Sandbox runbook: `docs/isolated-sandbox.md`
- PR #20: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/20
- PR #21: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/21
- Last recorded post-merge CI success: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/actions/runs/38454462425

Update this document whenever significant features, milestones, merges, tests, decisions, or verification gaps change. This file is a durable project handoff, not a substitute for checking the current repository state before every task.
