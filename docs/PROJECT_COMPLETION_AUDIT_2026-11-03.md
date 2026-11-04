# AI Open Source Engineer — Project Completion Survey

**Survey date:** 2026-11-03  
**Repository:** https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-  
**Branch audited:** `main` at the M99 merge line, with the M99 context refresh now merged.  
**Purpose:** distinguish implementation and CI evidence from integrations that have not been exercised with real accounts.

## Executive assessment

The repository is a substantial working prototype, not yet a verified end-to-end product release. It has a React/TypeScript/Vite frontend and a Node/Express/TypeScript backend, GitHub OAuth/session code, issue selection and repository-analysis helpers, AI planning/proposal/review paths, owner-scoped contribution lifecycle persistence, server-enforced proposal approval, atomic fork commits, explicit pull-request creation, secret/path checks, and an opt-in Docker sandbox.

**Highest verified milestone:** M99 — cross-user lifecycle isolation regression tests, merged in PR #140 at `404648cb443c7fb7e904a52a31faabc1dfe5a886`. The follow-up context-refresh PR #141 was merged on 2026-11-03 review at merge SHA `2e5a58f0988585229c1f5ccfe39b89fda803ecad`. The PR-head CI and CodeQL runs for #141 both passed. A scheduled CodeQL run on main at merge SHA `404648cb443c7fb7e904a52a31faabc1dfe5a886` also passed on 2026-11-02.

These checks establish code/test/security-analysis results for their exact commits. They do **not** prove that real GitHub OAuth, browser cookies, real forks, live commits, or PR creation have been successfully completed end to end.

## What is already implemented

1. **Product UI and API foundation:** React/TypeScript/Vite client and Express/TypeScript API, setup instructions, health endpoint, GitHub and AI provider integration code.
2. **Issue and repository intelligence:** good-first-issue discovery, AI issue selection, bounded repository source retrieval, implementation-plan/proposal/review helpers. Selected source-file retrieval now fails closed instead of silently substituting empty content.
3. **Contribution lifecycle:** persistent owner-scoped workflow state, event history, idempotency, optimistic versions, retryable/terminal states, cancellation, and HTTP-level lifecycle integration coverage.
4. **Approval and write safety:** server-side approval tied to a normalized proposal fingerprint; atomic multi-file commit; authenticated-user/fork ownership checks; legacy partial-write endpoint disabled; PR creation remains a separate explicit action.
5. **Security and operational safeguards:** secret/path detection with extensive synthetic edge-case coverage, input/path validation, session and OAuth-state code, trusted-origin checks, bounded request quotas, shared-store adapters/tests, and an opt-in Docker sandbox with resource limits and no network.
6. **Project governance:** CI and CodeQL workflows, README, SECURITY policy, sandbox and live-verification guides, per-user ownership/isolation guides, and a milestone roadmap/context snapshots.

## Verified versus not yet verified

### Verified from repository/CI evidence

- M94 lifecycle API integration tests and M95 server-enforced approval/write-path protections are recorded as merged.
- M96 fail-closed selected-source retrieval is recorded as merged.
- M97 live-verification runbook, M98 per-user ownership documentation, and M99 cross-user lifecycle regression tests are recorded as merged.
- PR #141 documentation/context refresh passed CI and CodeQL and is now merged.
- The main-branch scheduled CodeQL run checked on 2026-11-03 reported success for the 2026-11-02 run.

### Still unverified or incomplete

- **Real OAuth/browser session:** no evidence record yet shows the complete live sign-in, refresh, sign-out, expiry, and cookie behavior with a real GitHub account.
- **Two-account isolation:** automated tests inject synthetic session identities; the two-real-account fork/commit/PR isolation test remains outstanding.
- **Full contribution journey:** no recorded live run proves issue discovery → repository analysis → plan/proposal → AI review → human approval → fork → atomic commit → explicit PR creation against a safe upstream.
- **Provider-backed AI behavior:** CI does not prove live Gemini/OpenAI/Ollama calls, provider quota/error behavior, or output quality against diverse real repositories.
- **Sandbox boundary:** Docker checks are opt-in and are not a hardened multi-tenant execution service. Dependency installation is intentionally absent and network access is disabled, so some repository tests cannot run in the current sandbox.
- **Production hosting:** the backend explicitly refuses non-loopback binding pending deployment/security review. Current single-process/local persistence and mocked shared-store tests are not evidence of a production deployment.
- **Dependency updates:** PR #142 and #143 have failing frontend production-dependency audit steps; PR #144 has a failing frontend dependency-install step. Their CodeQL runs succeeded, and their backend jobs passed where applicable, but none is merge-ready until the CI failure is understood and resolved.

## Remaining work — 7 workstreams / 18 acceptance tasks

### W1. Dependency and CI repair (3 tasks)
1. Inspect full logs and dependency diffs for PR #142, #143, and #144.
2. Resolve the production audit failures on #142/#143 without suppressing meaningful security findings.
3. Resolve #144's install/lockfile failure; rerun install, audit, build, lint, backend tests/typecheck, and CodeQL on final heads.

### W2. OAuth middleware and identity-binding tests — next milestone M100 (4 tasks)
4. Exercise the actual Express middleware/session contract in integration tests rather than injecting identity only at the route boundary.
5. Cover missing and expired sessions, malformed/stale cookies, and authentication-store errors.
6. Cover sign-out invalidation and prove that mismatched GitHub identity/token cannot authorize writes.
7. Add a regression assertion that no maintainer/service token fallback exists for user-owned fork, branch, commit, or PR operations. Keep OAuth provider exchange mocked in CI and label it accurately.

### W3. Live OAuth and two-account acceptance (3 tasks)
8. Run the live OAuth callback and verify the expected account through the authenticated-me endpoint.
9. Verify refresh persistence, sign-out, expiry, and unauthenticated rejection in a real browser.
10. Use two separate GitHub accounts/browser profiles to prove fork ownership, workflow privacy, commit authorization, and PR head/base ownership. Record sanitized evidence against the tested SHA.

### W4. Full workflow smoke test and recovery (3 tasks)
11. Execute a low-risk real issue through discovery, source analysis, planning, proposal generation, and AI review.
12. Verify human approval is required for the exact proposal and that edits invalidate prior approval.
13. Verify fork, branch, atomic commit, explicit PR creation, retry/recovery, and failure handling with real GitHub API results.

### W5. AI/repository quality and sandbox limits (2 tasks)
14. Test representative small, medium, and large repositories, including truncated trees, missing selected files, provider errors, malformed model output, and prompt-injection content.
15. Document and test sandbox limits; decide whether a stronger isolated dependency-preparation/VM strategy is required before supporting arbitrary external repositories. Do not enable networked dependency installation in the API process.

### W6. Deployment and security readiness (2 tasks)
16. Decide whether the first release is strictly local-only or requires hosted multi-user deployment. Do not expose the current loopback-only service.
17. If hosting is required, complete HTTPS/cookie/session-store validation, shared rate limiting, secret management, monitoring, backups/recovery, abuse/cost controls, and a documented deployment threat model.

### W7. Release and product completion (1 task)
18. Run a release checklist on a clean environment, ensure license/product terms are explicit, refresh setup/troubleshooting docs, and publish a version only after the acceptance evidence is complete.

## Time estimate

These are planning estimates, not promises, and assume one developer/agent can work steadily with access to GitHub and configured provider credentials.

| Target | Estimated effort | Approximate calendar time | Completion condition |
|---|---:|---:|---|
| Repair current dependency PRs and establish green baseline | 0.5–2 working days | 1–3 days | All dependency PR failures understood; safe updates merged only with green CI and CodeQL |
| Verified local MVP | 5–8 working days | 1–2 weeks | M100 tests, real OAuth/browser test, two-account isolation, and one full low-risk contribution journey recorded |
| Release candidate with quality/security hardening | 10–15 working days total | 2–3 weeks | Above plus representative repository/provider/sandbox tests and release documentation |
| Hosted production-ready multi-user service | 15–25+ working days total | 3–6+ weeks | Explicit hosting architecture, deployment-grade state/session/rate limiting, stronger sandbox isolation, operational controls, and live acceptance tests |

Real OAuth and two-account verification require usable OAuth credentials and two GitHub accounts. Waiting for those inputs or external CI/provider outages can extend calendar time. “All project complete” is not a finite milestone while the scope continues to expand; the acceptance conditions above define a practical first release.

## Recommended execution order

1. Repair and safely resolve PRs #142–#144; keep the main branch green.
2. Implement M100 against the actual auth/session middleware and token plumbing.
3. Run live OAuth and two-account acceptance tests; preserve evidence without credentials.
4. Run one full contribution smoke test from issue discovery to explicit PR creation.
5. Fix the concrete gaps exposed by that test; test representative repositories and sandbox constraints.
6. Decide local-only MVP versus hosted service. Do not claim production readiness until hosting and isolation requirements are actually implemented and tested.
7. Complete release checklist and tag a version.

## Safety rules that remain mandatory

- Human approval is required before committing a proposed contribution.
- Pull-request creation is a separate explicit user action.
- Each contributor's own GitHub session token must authorize their operations; never fall back to a maintainer token.
- Treat issue/repository content and model output as untrusted; never execute external code in the API process.
- Never merge a PR until required CI and CodeQL pass on its final head.
- Keep live-provider checks and synthetic/mocked CI evidence clearly separated.


## Additional critical CI finding — 2026-11-03

The post-merge CI run on context-refresh merge SHA `2e5a58f0988585229c1f5ccfe39b89fda803ecad` failed in **both** dependency-audit steps. This is a main-branch health issue, not a failure in the documentation diff:

- Backend audit: 2 vulnerabilities — high-severity `body-parser` (GHSA-27r3-jxmh-p828) and moderate `qs` (GHSA-6pq8-jhm2-2vcw). The report says `npm audit fix` is available.
- Frontend audit: 14 vulnerabilities (12 moderate, 2 high), including `minimatch` (GHSA-g3hv-75wg-m249), Vite 8.0.0–8.1.5 advisories (including GHSA-9jrq-w75r-8gcw), and `zod` (GHSA-mrhx-c7xc-m3w5). The report indicates ordinary fixes for some packages and a breaking-change `--force` suggestion for the minimatch dependency chain; do not run force updates blindly.
- Dependabot PR #142's frontend-independent backend audit job fails on the same backend `body-parser`/`qs` findings. PR #143's frontend audit fails on the frontend dependency set. PR #144 fails `npm ci` with ERESOLVE because its proposed TypeScript 7.0.2 conflicts with `typescript-eslint@8.71.2` peer requirement `typescript >=4.8.4 <6.1.0`.
- The corresponding CodeQL runs for #142–#144 succeeded; that does not replace dependency audit or successful install/build checks.
- Documentation PR #145 is open; its CI and CodeQL were queued when last checked. Do not merge until checks on its final head are green. Because main CI is currently red, resolve the underlying dependency baseline first, then re-check #145.

**Immediate priority is now dependency/CI repair before M100.** Update compatible direct/transitive versions and lockfiles, avoid suppressing audit findings or using `--force` without compatibility review, then rerun install, audit, build/lint, backend typecheck/tests, and CodeQL.


## Product requirement confirmed — individual GitHub identity and contribution history

The product requirement is that every user signs in with their own GitHub account and all GitHub actions initiated by the app are attributed to that account. The user's dashboard must also display the complete contribution history belonging to that authenticated account.

### Existing code found during the 2026-11-03 review

- `GET /api/auth/github`, callback, `GET /api/auth/me`, and logout routes exist.
- The OAuth callback stores the user's access token in the server-side session; the browser receives a session cookie.
- GitHub write routes use the current session token and validate the authenticated account/fork owner for write operations.
- `GET /api/lifecycle/` lists contribution workflow records scoped to the authenticated login.
- The current frontend has a sign-in status component and a contribution workflow screen, but the reviewed `App.tsx` only routes to landing and contribution pages. The contribution screen restores a single workflow pointer from local storage; there is no verified all-contributions dashboard/history view yet.

### Additional acceptance criteria

1. Add a signed-in user dashboard showing all contribution records for the authenticated GitHub login, not just the last workflow pointer stored in the browser.
2. Each record should show upstream repository, issue, fork/repository, branch, current lifecycle state, timestamps, commit SHA/link, and pull-request number/link when available.
3. Add filters/search for active, awaiting approval, committed, PR opened, merged, closed, failed, and cancelled contributions. Distinguish states the app can observe from GitHub's actual PR state.
4. Add refresh/reconciliation against GitHub so external PR updates (opened, merged, closed) are reflected. Do not infer PR merged status merely from local commit completion.
5. Preserve per-user privacy: every history query must be authenticated and server-scoped; users must never query another login's records by supplying a username.
6. Verify with two real GitHub accounts that each account's dashboard only shows its own workflows and its GitHub profile/repositories show activity attributed to that same account.
7. Explain that GitHub's profile contribution graph is controlled by GitHub's eligibility rules and user privacy settings. The app can create correctly attributed forks, commits and PRs, but cannot force GitHub to count every action in the contribution graph.

This dashboard/history requirement is added to the remaining scope; it is not complete merely because the backend list endpoint exists.
