# AI Open Source Engineer — Project Context Snapshot

**Snapshot date:** 2026-11-06 (UTC)  
**Repository:** https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-  
**Default branch:** `main`  
**Purpose:** Preserve durable project state so future sessions resume from verified repository facts rather than chat history alone.

## Product definition

AI Open Source Engineer is an AI-assisted open-source contribution workflow. It discovers GitHub issues, analyzes repository source, drafts and reviews concrete file changes, and prepares contributions in a fork. Human approval is required before contribution writes, and pull-request creation is a separate explicit user action.

Core lifecycle:
1. Discover eligible GitHub issues.
2. Analyze the upstream repository and relevant source.
3. Generate an implementation proposal and proposed file contents.
4. Review the proposal.
5. Wait for explicit human approval.
6. Fork the upstream repository, create a branch, and commit proposed files atomically.
7. Create the pull request only after a separate explicit user action.

The README describes persistence for contribution state and event history, owner-scoped access, idempotent creation, optimistic concurrency, retryable failures, bounded history, and the current single-process/loopback deployment constraints.

## Working method and roadmap

The project is organized as **10 main parts**, each split into subparts. Work one main part at a time, complete its subparts in order, and verify implementation and tests before marking it complete. Do not skip ahead or claim completion based only on a PR being opened.

Part 2 is **GitHub authentication and user-account management**:
- 2.1 GitHub OAuth login and callback.
- 2.2 Secure sessions and token handling.
- 2.3 Logout, expiration, and error handling.
- 2.4 User identity and permissions.
- 2.5 Multi-account isolation.

**Part 1 reconciliation (2026-11-06):** The older note that Part 1.1 was complete and Part 1.2 was in progress is superseded. The engineering foundation/architecture audit is complete; compatible dependency remediation and documentation consolidation are merged. Part 1 is **substantially complete but not fully closed** because the active `Protect main` ruleset still has zero required approving reviews and zero required status checks. The available GitHub connection can inspect but cannot edit this administrative ruleset. Live OAuth, real two-account acceptance, production Redis, and production deployment validation remain separate release gates and must not be described as passing.

## Part 2 — implementation evidence

The repository history and PRs indicate the following work:
- PR #158: GitHub OAuth integration-test coverage.
- PR #159: encrypted sessions and account isolation.
- PR #160: Part 2 completion documentation.
- PR #162: additional account-isolation and session-hardening tests; merged after exact-head CI/CodeQL passed.

Relevant implementation/test paths identified:
- `server/src/security/session.ts`
- `server/src/routes/github.ts`
- `server/tests/githubOAuth.integration.test.ts`
- `server/tests/sharedSession.test.ts`
- `server/tests/deploymentConfig.test.ts`

Security behavior documented and covered by automated tests:
- Cryptographically random OAuth state with a ten-minute TTL, bound to an HttpOnly SameSite=Lax cookie and consumed once.
- OAuth callback state/code validation before token exchange.
- GitHub access tokens retained server-side; `/api/auth/me` exposes account identity metadata, not the access token.
- HttpOnly/SameSite=Lax session cookies; Secure in production.
- Eight-hour session expiry.
- Redis-backed session records encrypted/authenticated using AES-256-GCM; tampered or malformed records rejected.
- Production configuration validation for OAuth credentials, HTTPS Redis, a unique 32+ character session encryption key, HTTPS API/callback URLs, HTTPS client origins, and sandbox disablement.
- Logout checks trusted Origin, clears the cookie, and deletes only the presented session.
- Contribution lifecycle records and mutations are scoped to the authenticated GitHub login.
- GitHub write operations use the token belonging to the current server-side session and validate repository/fork ownership.

## Part 2 final merge and validation

**PR #162:** https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/162  
**Status:** merged 2026-11-06.  
**Head SHA:** `f8c07edc77fd07dfecdbccabd8c3c40ab0562bb8`  
**Merge commit:** `7a9be63238d9eb71f618dfe9c98b2139aa29d2f1`  
**Exact-head CI:** run `42152104926` passed.  
**Exact-head CodeQL:** run `42152104966` passed.  
**Post-merge CI:** run `42153366880` passed on the merge commit.  
**Post-merge CodeQL:** run `42153366890` passed on the merge commit.

A failing test assertion was corrected on 2026-11-06. The GitHub repository-search route appends `archived:false fork:false` to the query, so the account-token isolation test was updated to match the normalized query prefix. Fix commit: `30302f9d7a992c9236d9a013ac7b5624453e4992`.

Part 2's automated implementation/test requirements are complete and merged. This does not certify live OAuth provider configuration, real browser sessions, two real GitHub accounts, or production Redis.

## Verification boundary — do not overstate

Automated OAuth integration tests use mocked GitHub provider responses and synthetic identities. They validate application route/session behavior, not a real deployed GitHub OAuth App or real provider permission grants.

Still required for production acceptance:
1. Real browser OAuth login using a dedicated test OAuth App and disposable account.
2. Refresh persistence and logout over HTTPS with configured Redis.
3. Two real GitHub accounts in separate browser profiles; verify contribution records remain isolated.
4. Redis outage, TTL, and backup/restore checks in a disposable environment.
5. Record redacted evidence in `docs/github-oauth-live-verification.md`.

Never commit or paste OAuth client secrets, access tokens, Redis tokens, encryption keys, authorization codes, or session cookies. Keep loopback binding and production sandbox guards enabled until deployment/security review is complete.

## Immediate next actions

1. Resolve the `Protect main` ruleset administratively by requiring the CI and CodeQL checks and selecting an appropriate approval policy; re-read the ruleset to verify the change.
2. Complete real OAuth/browser, two-account isolation, and production Redis acceptance in a controlled test environment; record sanitized evidence in the live-verification docs.
3. Continue with Part 4 (fork, branch, and commit correctness) from the implementation roadmap. Keep live GitHub API behavior and large-repository analysis as explicit integration checks; do not confuse those release gates with mocked CI coverage.

## Session handoff rules

- Work directly in the GitHub repository when requested; user prefers execution over instructions to manually do the work.
- Organize work by main parts and subparts; finish one by one.
- Distinguish merged code, open PRs, passing CI, mocked tests, and real-world acceptance.
- Inspect current GitHub state before resuming; this snapshot is a dated handoff, not a substitute for live verification.


## Part 1 reconciliation — evidence and decision (2026-11-06)

- PR #154 (`docs: record engineering foundation audit and Part 1 status`) merged the architecture/CI/CodeQL and repository foundation audit.
- PR #155 (`docs: record final Part 1 protection and blocker verification`) merged the exact ruleset finding: `Protect main` has `required_approving_review_count: 0` and an empty `required_status_checks` array. It blocks deletion and non-fast-forward updates, but it is not a strong CI/review merge gate.
- Compatible dependency groups #142, #150, and #153 and peer-dependency enforcement #152 were merged. Incompatible TypeScript 7 PR #151 was not merged; compatible TypeScript 6 tooling was delivered through PR #156. Do not describe #151 as merged.
- Stale documentation PRs #145 and #146 were closed without merging; their useful content was ported and consolidated in merged PR #157.
- PR #162 completed Part 2 automated authentication/session/account-isolation tests and merged as `7a9be63238d9eb71f618dfe9c98b2139aa29d2f1`; exact-head CI/CodeQL and post-merge CI/CodeQL passed.

**Part 1 disposition:** engineering foundation and dependency/documentation cleanup are complete; administrative branch-protection hardening remains outstanding. Therefore Part 1 is recorded as **substantially complete — blocked on repository administrator configuration**, not fully complete. Live OAuth and production integration tests are release acceptance gates and are not CI-proven.


## Part 3 — issue and repository intelligence (automated implementation/test scope complete and merged)

**PR #164:** https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/164  
**Merged:** 2026-11-06.  
**Merge commit:** `8c8595f9c4874a2e49d75d525954fa9b9854d5b2`  
**Final PR head:** `189082590390e5c72a00d8c778b99b9de2134ec2`.

Implemented in the current worktree/PR branch:
- Added `server/src/security/issueDiscovery.ts` with validated search options, GitHub query construction, and normalization/eligibility checks.
- Replaced the fixed 30-item issue search with bounded page/per_page, q, repo, labels, sort, order, and stale_days controls. Alternative labels are ORed, not ANDed. Added user-facing search, repository, label, sort, order, freshness, matching-issue, exclusion-summary, and pagination controls to the contribution screen.
- Uses the authenticated session token when available; maps GitHub rate limiting to HTTP 429 and preserves Retry-After.
- Excludes pull-request search results, malformed records, closed/locked issues, duplicate-labelled issues, assigned or explicitly claimed/in-progress issues, and stale issues; returns exclusion counts and the GitHub incomplete-results signal.
- Prioritizes root/nested README, CONTRIBUTING, AGENTS, SECURITY, architecture guidance, and dependency manifests during source selection.
- Repository analysis fails closed if no files are selected, selected-file retrieval fails, or the bounded snapshot has no implementation source. The analysis endpoint reports an upstream-context failure instead of sending empty source to the AI.
- Added unit tests for issue query/filters/eligibility/malformed results and repository context guidance/source requirements. Final CI run `42160691292` passed: backend typecheck, all 286 backend tests, frontend build, and frontend lint. Final CodeQL run `42160691436` passed on the same final PR head.
- Added `docs/issue-and-repository-intelligence.md` and linked it from README.

Known limits: language/framework facets are not yet a dedicated verified filter; issue-search payloads do not exhaustively identify linked PRs; assignment/claim labels are heuristics; large repositories are analyzed from a bounded sample. The automated implementation/test scope is complete and merged. Live GitHub API behavior and representative public/private repository analysis remain integration acceptance checks and are not proven by mocked/unit tests.
