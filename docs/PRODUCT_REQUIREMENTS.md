# AI Open Source Engineer — Product Requirements

**Status:** Authoritative product requirements baseline  
**Last updated:** 2026-11-03  
**Repository:** `thakareatharv49-svg/AI-OpenSource-Engineer-`

## Product vision

Build a secure, multi-user AI open-source contribution platform. Each person connects their own GitHub account, discovers real open-source issues, receives repository-aware AI assistance, reviews and approves proposed changes, contributes through their own fork and branch, submits a pull request to the original repository, requests review from its actual owner when eligible, and tracks every contribution in a personal dashboard.

The product is an engineering workflow and contribution platform, not merely a code generator.

## Non-negotiable principles

1. Every user authenticates with their own GitHub account.
2. All GitHub writes use that user's own authorization and identity.
3. User tokens, sessions, forks, workflows, and contribution histories are isolated.
4. No shared maintainer/developer identity may submit contributions for users.
5. AI must inspect repository context before proposing or implementing a fix.
6. Human approval is required before committing and PR creation; PR creation is a separate explicit action.
7. Every PR for an issue targets the original/upstream repository where that issue exists.
8. Request review from the original repository owner after PR creation when GitHub says the owner is an eligible reviewer; report failures honestly and support eligible maintainer alternatives.
9. My Contributions lists all records belonging to the authenticated user, not merely the last browser-local workflow.
10. Local statuses must be reconciled with actual GitHub PR/review state.
11. Never claim tests, checks, notifications, or GitHub actions succeeded unless they were actually verified.
12. Never merge project changes while required CI and CodeQL checks are failing or pending.

## 1. Accounts, GitHub OAuth, and identity

- Continue with GitHub OAuth, callback, authenticated identity display, logout, session renewal/expiry handling, and disconnect/revocation.
- Store OAuth tokens securely on the server; never expose them to browser storage or logs.
- Request least-privilege scopes needed for issue discovery, fork/branch/commit creation, PR creation, and reviewer requests.
- Derive the current user from the validated server-side session. Never trust a caller-supplied username or owner identity.
- Handle revoked, expired, insufficient-scope, and rate-limited authorization states.
- Keep all account-specific data scoped to a stable authenticated GitHub identity.

## 2. Issue discovery

- Search open issues across public repositories and repositories visible to the user.
- Filter by language, framework, repository, labels, difficulty, age, activity, and good-first-issue/help-wanted labels.
- Show issue description, comments, labels, author, repository metadata, and canonical URLs.
- Detect closed, locked, duplicate, stale, already-claimed, or PR-addressed issues where evidence permits.
- Recommend issues using transparent suitability signals such as complexity, repository health, relevance, and user skill fit.
- Clearly distinguish confirmed facts from inferred suitability.

## 3. Repository analysis

Before coding, inspect repository structure, languages, frameworks, dependencies, README, CONTRIBUTING, AGENTS.md when present, architecture, relevant source files, tests, coding conventions, license, and security guidance. Identify likely files, constraints, risks, and unknowns. Do not implement based only on an issue title.

## 4. AI issue analysis and proposal

Every proposal should contain problem summary, evidence/root-cause analysis, expected behavior, proposed solution, likely files, implementation steps, testing plan, risks, compatibility/breaking-change notes, and complexity estimate. Label verified facts, assumptions, and unknowns. Do not claim a bug was reproduced unless it was actually reproduced.

## 5. Human approval and control

- Discovery and analysis may run without approval.
- User reviews and approves the proposal before implementation workflow begins.
- User reviews the final diff and actual test results before commit.
- Commit requires explicit approval of the final changes.
- PR creation is a separate explicit approval/action.
- Owner/maintainer review request occurs only as part of the user-approved PR submission flow.
- Provide reject, request-changes, cancel, and safe-retry controls.
- Never silently commit or submit a PR.

## 6. Fork management

- Create or reuse a fork under the authenticated user's account.
- Verify fork owner and upstream parent relationship from GitHub metadata.
- Handle existing forks, fork synchronization, archived repositories, permissions, and API failures.
- Never use another user's fork or a platform-owned shared fork.

## 7. Branch management

- Create a dedicated descriptive branch per contribution, based on the correct upstream target branch.
- Never commit directly to the default branch.
- Prevent collisions and duplicate operations.
- Record branch, source/base SHA, fork, and upstream relationship.
- Handle upstream movement and safe cancellation/retry.

## 8. AI implementation

- Implement only the approved proposal.
- Follow repository conventions and keep patches focused.
- Preserve compatibility where possible; avoid unrelated refactors and unnecessary files.
- Add/update tests and documentation where appropriate.
- Avoid hardcoded secrets and insecure dependencies.
- Explain meaningful changes and provide a reviewable diff.
- Support multiple languages/frameworks as capabilities are validated.

## 9. Quality gates and test honesty

Run applicable formatting, lint, typecheck, unit/integration tests, build, dependency/security scans, secret detection, and patch/diff validation. Report each as passed, failed, skipped, or not executable, with evidence/reason. Never label an unrun check as passed. Use bounded repair attempts and stop rather than loop indefinitely.

## 10. Secure execution

Treat repositories and scripts as untrusted. Use isolated sandboxes, CPU/memory/time limits, restricted filesystem access, no unrestricted network by default, no access to user secrets or other users' files, controlled dependency installation, safe cleanup, and explicit policy for any network exception.

## 11. Commits and attribution

After approval, commit only approved files to the user's fork/branch. Use meaningful messages, atomic commits, idempotency, and record SHA/URL, contributor identity, issue, upstream, fork, branch, and timestamps. Verify the resulting commit exists in the user's fork. Preserve correct Git author/committer identity where supported by the authenticated GitHub workflow.

## 12. Upstream pull requests

For an issue in `UPSTREAM_OWNER/UPSTREAM_REPO#N`, the PR must be created in `UPSTREAM_OWNER/UPSTREAM_REPO`, with:
- head repository: authenticated user's fork;
- head branch: that user's contribution branch;
- base repository: the original/upstream repository;
- base branch: the actual intended target branch (normally the upstream default branch unless issue/repo policy indicates otherwise).

Before creation, verify upstream identity, fork parent, authenticated fork ownership, branch existence, base branch, and that the PR does not already exist. Never accidentally target the user's fork. Include a meaningful title/body, issue reference, solution summary, tests actually run, and relevant screenshots/evidence. Record PR number/URL/head/base/author. PR creation remains a separate explicit user-approved action.

## 13. Original repository owner review request

After the approved PR is created:
1. Read the original repository metadata and obtain its canonical owner login from GitHub, not AI-generated text.
2. Check GitHub's reviewer eligibility/constraints (including self-review, permissions, repository policy, and API response).
3. Request the original owner as an individual reviewer when eligible.
4. If the owner cannot be requested, record the precise failure and offer eligible maintainers/team reviewers only when they can be reliably identified and are appropriate.
5. Persist the reviewer requested, request timestamp, API outcome, and error details in redacted form.
6. Show separate states for PR created, review request sent/failed/unavailable, review received, changes requested, and approved.
7. Never claim the owner was notified unless GitHub confirms the request.
The owner-review request is performed within the explicitly approved PR submission workflow and must not make an otherwise successful PR disappear if reviewer request fails.

## 14. My Contributions dashboard

Provide an authenticated dashboard listing every contribution lifecycle record for the current session identity. It must not rely on a single localStorage pointer. Show:
- original issue title/number/URL;
- original repository;
- user's fork/repository;
- contribution branch;
- workflow state and timestamps;
- commit SHA/URL;
- PR number/URL;
- PR head and base repository/branch;
- original owner and requested reviewer(s);
- review-request result and review status;
- actual GitHub PR state, CI/check summary where available, merged/closed timestamps.

Support pagination, search, filters (all, active, awaiting approval, implementing, testing, committed, PR opened, review requested, changes requested, approved, merged, closed, failed, cancelled), workflow event history, open links, eligible retries, and cancellation. The server must scope all reads and writes to the authenticated session identity.

## 15. GitHub status reconciliation

Reconcile local lifecycle state with GitHub's actual PR, review, and check state on demand and/or through safe background/webhook processing. Distinguish app workflow status from GitHub PR state. Track open/draft/closed/merged, requested reviewers, submitted reviews (comment/changes requested/approved), and checks where available. A commit is not a merged PR. If a maintainer merges directly on GitHub, the dashboard must eventually reflect it.

## 16. GitHub contribution attribution

Ensure forks, commits, and PRs are created under the user's authenticated GitHub identity. Store canonical GitHub URLs and verifiable identifiers. Explain that GitHub controls contribution-graph eligibility and display; the platform cannot force an event to count or appear.

## 17. Multi-user security and privacy

- Per-user tokens, sessions, lifecycle records, and resource ownership.
- Server-side authorization on every lifecycle/history/commit/PR operation.
- Never accept browser-supplied user identity as authority.
- No cross-user token, fork, workflow, event, or contribution access.
- Secure cookies, CSRF protections where relevant, rate limits, validation, audit events, secret redaction, safe errors, and retention controls.
- Admin observability must not expose raw OAuth tokens or grant unrestricted access to private user data.

## 18. Workflow reliability

Persistent state, event history, idempotency keys, optimistic concurrency, bounded retries, cancellation, restart/browser-refresh recovery, partial-operation compensation/reconciliation, duplicate prevention, and clear actionable errors. Retrying must not create duplicate forks, branches, commits, PRs, or reviewer requests.

## 19. AI intelligence

Incrementally improve large-repository understanding, semantic code search, root-cause analysis, multi-file patches, test-failure diagnosis/repair, repository convention adaptation, duplicate-solution detection, quality/confidence estimates, issue prioritization, user-skill matching, and configurable AI providers/models. Communicate confidence and limitations honestly.

## 20. User experience

Professional responsive application with landing page, GitHub login, dashboard, issue discovery/details, repository analysis, proposal review, diff review, testing results, contribution workflow, My Contributions, PR/review tracking, and settings. Provide accessible navigation, progress, loading/error/empty states, clear language, and direct links to GitHub artifacts.

## 21. Documentation

Maintain product vision, requirements, architecture, roadmap/milestones, installation, environment variables, OAuth setup, security/isolation model, API docs, lifecycle, AI/sandbox design, testing, deployment, troubleshooting, limitations, completion audit, and verification evidence.

## 22. Administration

Provide platform health, workflow/failure monitoring, GitHub API usage/rate limits, AI provider usage/costs, job queues, logs, configuration, abuse detection, and integration health. Preserve user privacy and never expose OAuth secrets.

## 23. Performance and scalability

Use pagination, background jobs/queues, bounded concurrency, caching, indexes, API rate-limit backoff, monitoring, and scalable stateless services where appropriate. Avoid designs that work only for a single local user.

## 24. Production readiness

Production hosting, HTTPS, durable database, secure OAuth callbacks/secrets, migrations, backups, monitoring/error reporting, health checks, CI/CD, deployment automation, and recovery procedures. Prove local end-to-end behavior before public deployment.

## 25. End-to-end acceptance tests

At minimum verify:
- OAuth identity and own-account writes;
- two real accounts cannot see each other's data;
- issue discovery and repository analysis;
- proposal review and explicit approval;
- fork ownership and branch correctness;
- implementation and honest test results;
- commit in user's fork with verifiable attribution;
- PR authored by user and targeting original repository;
- original owner reviewer request succeeds or a precise failure is recorded;
- dashboard lists all and only the current user's contributions;
- status reconciliation detects external merge/close/review changes;
- retries do not duplicate operations;
- cancellation and restart recovery work.

The release acceptance scenario uses two separate real GitHub accounts and independent repositories/issues. Each account must see only its own workflows and GitHub activity.

## 26. Definition of done

The first complete release is accepted only when two different people can independently authenticate with their own GitHub accounts, discover real issues, receive repository-aware AI proposals, approve and test fixes, commit to their own forks, submit PRs to the original repositories, request eligible original-owner reviews, and track all contribution and review/merge states in isolated personal dashboards.

GitHub contribution graph visibility is not guaranteed by the platform; correct GitHub attribution and eligibility must be verified and documented.

## Product delivery phases

1. Dependency/CI baseline repair.
2. OAuth/session identity and isolation verification.
3. Issue discovery quality.
4. Repository intelligence.
5. AI proposal quality.
6. Human approval controls.
7. Fork/branch correctness.
8. Implementation and test quality.
9. Commit attribution and idempotency.
10. Upstream PR targeting.
11. Original owner/maintainer review requests.
12. Complete My Contributions dashboard.
13. GitHub PR/review/check reconciliation.
14. Workflow recovery and reliability.
15. Security/privacy audit.
16. Deployment and operations.
17. Two-account end-to-end release acceptance.

Each phase must be decomposed into small, testable milestones. Existing code must be audited before rebuilding. Mark a capability as complete only when evidence supports it.
