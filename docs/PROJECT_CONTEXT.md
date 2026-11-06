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

Earlier planning context (2026-11-04) recorded Part 1.1 complete and Part 1.2 in progress. Reconcile Part 1 against current repository state before changing its completion status; do not assume that old progress note is still current.

## Part 2 — implementation evidence

The repository history and PRs indicate the following work:
- PR #158: GitHub OAuth integration-test coverage.
- PR #159: encrypted sessions and account isolation.
- PR #160: Part 2 completion documentation.
- PR #162: additional account-isolation and session-hardening tests; this is the active validation PR at snapshot time.

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

## Latest active PR and validation state

**PR #162:** https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/162  
**Title:** `test(auth): verify per-user session and contribution isolation`  
**Head branch:** `part-2-account-isolation-and-session-hardening`  
**Latest head SHA:** `30302f9d7a992c9236d9a013ac7b5624453e4992`  
**Base:** `main` at `22c2960141ef4eb73cd58ab543eadbe4a495339f` when the PR was inspected.

A failing test assertion was corrected on 2026-11-06. The GitHub repository-search route appends `archived:false fork:false` to the query, so the account-token isolation test was updated to match the normalized query prefix. Fix commit: `30302f9d7a992c9236d9a013ac7b5624453e4992`.

Latest observed checks at snapshot time:
- Frontend build: passed.
- Frontend lint: passed.
- Backend typecheck: passed.
- Backend test job: still running; no final conclusion observed.
- CodeQL: passed (run #403).
- CI run #573: still in progress, specifically backend tests.

PR #162 was observed open and mergeable when inspected. Do not infer merge success from the populated merge_commit_sha field. Confirm the PR's current merged/state fields and latest checks before any merge. Do not merge while required checks are pending or failing.

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

1. Re-fetch PR #162 and its current head SHA.
2. Re-check CI and CodeQL for that exact head. If backend tests fail, inspect logs, fix the root cause, and wait for fresh checks.
3. Merge PR #162 only after all required checks pass; then verify the PR is actually merged and `main` points to the resulting commit.
4. Verify Part 2's merged code and documentation on `main`; mark Part 2 complete only after that.
5. Update the project roadmap/context with the verified merge SHA and check results.
6. Move to the next incomplete part only after Part 2 is complete. Reconcile Part 1's older progress note against the current repo first.

## Session handoff rules

- Work directly in the GitHub repository when requested; user prefers execution over instructions to manually do the work.
- Organize work by main parts and subparts; finish one by one.
- Distinguish merged code, open PRs, passing CI, mocked tests, and real-world acceptance.
- Inspect current GitHub state before resuming; this snapshot is a dated handoff, not a substitute for live verification.
