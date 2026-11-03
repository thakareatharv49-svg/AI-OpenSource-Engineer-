# AI Open Source Engineer — Implementation Roadmap

**Updated:** 2026-11-03  
**Source of truth:** `docs/PRODUCT_REQUIREMENTS.md`

## Execution order

### Stage 0 — Stabilize the repository
- Inspect main and open dependency PRs (#142–#144).
- Repair dependency vulnerabilities with compatible, non-forced upgrades.
- Resolve TypeScript peer compatibility.
- Regenerate lockfiles using clean installs.
- Run backend/frontend install, audit, typecheck, tests, lint, and build.
- Verify CI and CodeQL on final PR heads.
- Do not suppress advisories or merge while required checks fail.

### Stage 1 — Identity and isolation (M100)
- Audit OAuth callback, session cookie, logout, token storage, and scopes.
- Add middleware-level identity-binding tests.
- Add cross-user tests for lifecycle list/detail/mutations and all contribution resources.
- Verify no maintainer-token fallback.
- Exercise two real GitHub accounts in separate browser profiles.

### Stage 2 — Issue and repository intelligence
- Verify issue discovery filters, pagination, and unsuitable/duplicate issue handling.
- Verify repository analysis uses actual files and contribution guidelines.
- Ensure proposal claims distinguish evidence, assumptions, and unknowns.

### Stage 3 — AI implementation and quality gates
- Verify approved proposal is bound to the exact patch.
- Improve focused multi-file patch generation.
- Run honest lint/typecheck/test/build/security checks.
- Add bounded repair/retry behavior and safe sandbox controls.

### Stage 4 — Fork, branch, and commit correctness
- Verify fork owner and upstream parent using GitHub metadata.
- Verify branch is created in the user's fork from the intended upstream base.
- Verify only approved files are committed.
- Verify commit SHA and attribution.
- Add idempotent retry tests.

### Stage 5 — Upstream PR targeting
- Resolve upstream repository from the source issue and verify canonical identity.
- Verify fork parent relationship and current authenticated fork ownership.
- Create PR with fork branch as head and original repository branch as base.
- Confirm PR author, head repo, head branch, base repo, and base branch from GitHub's returned PR object.
- Detect duplicate PRs before create/retry.
- Keep PR creation as explicit user action.

### Stage 6 — Original owner review request
- Derive owner login from original repository metadata.
- Check eligibility and avoid self-review.
- Request owner reviewer after PR creation.
- Record confirmed success or precise failure.
- Offer eligible maintainer/team alternative only when reliably identified.
- Test API errors, unavailable owner, and partial success (PR exists but reviewer request fails).

### Stage 7 — My Contributions dashboard
- Consume authenticated lifecycle list endpoint.
- Display all records with issue/upstream/fork/branch/commit/PR/reviewer/status/timestamps.
- Add pagination, search, filters, detail view, and event timeline.
- Remove reliance on one localStorage workflow pointer as the history source.
- Enforce server-side per-user scope.

### Stage 8 — GitHub status reconciliation
- Fetch/reconcile actual PR state, reviews, requested reviewers, and checks.
- Handle merged/closed externally.
- Distinguish app workflow state from GitHub state.
- Add safe polling/webhook strategy and rate-limit backoff.

### Stage 9 — Reliability, security, and production
- Verify restart recovery, cancellation, idempotency, concurrency, and partial failure.
- Complete threat model and multi-user isolation audit.
- Add monitoring, backups, deployment automation, and production secrets management.

### Stage 10 — Release acceptance
- Run two-real-account full workflow.
- Verify each PR is upstream-targeted and attributed to the contributor.
- Verify owner review request result.
- Verify dashboards are isolated and reconcile GitHub changes.
- Publish verification report and known limitations.

## Merge policy

- Never merge a PR unless all required CI checks and CodeQL pass on its latest head SHA.
- Recheck head SHA immediately before merge.
- Do not bypass required checks or hide dependency/security findings.
- If a check fails, inspect logs, fix the cause, and rerun.
- Keep feature work behind a green baseline when practical.

## Current known baseline (2026-11-03)

- Repository default branch: `main`.
- Main dependency state needs audit.
- Open Dependabot PRs #142, #143, and #144 require compatibility/CI review; do not assume their updates are safe.
- PR #145 contains the prior completion audit/dashboard requirement documentation and must be checked against its latest head/checks before merge.
- Existing OAuth, per-user lifecycle API, fork/branch/commit/PR foundations exist, but live OAuth and two-account behavior remain unverified.
- The frontend does not yet have a verified complete all-contributions history dashboard; a single localStorage workflow pointer is insufficient.
- Original-repository PR target and owner reviewer request must be verified in code and end-to-end tests.

## Evidence discipline

Every milestone report must state:
- code changed;
- tests actually run and results;
- CI/CodeQL run IDs and exact head SHA;
- verified behavior;
- untested integrations/limitations;
- PR URL and merge SHA, if merged.

Do not mark live GitHub OAuth, real-account isolation, external PR reviewer notification, or contribution graph visibility as verified based solely on mocked/synthetic tests.
