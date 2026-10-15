# Per-user isolation regression coverage (Milestone 99)

## Purpose

Protect the rule that contribution state belongs to the GitHub login authenticated by the request. These tests exercise the real Express lifecycle router over HTTP while injecting a controlled test-session identity; they are automated authorization regression tests, not a live OAuth-provider test.

## Automated assertions

The lifecycle route integration suite verifies:

- an unauthenticated request cannot list contribution workflows;
- one user cannot read, transition, or approve another user's workflow (the API returns not-found to avoid disclosing ownership);
- contribution lists only include records for the current login;
- retrying a create with the same idempotency key reuses the workflow for that same login;
- another login using the same idempotency key receives a separate workflow and cannot see the first user's record;
- approval is rejected before the workflow reaches the approval state;
- an approval is bound to the proposal fingerprint recorded by the server;
- stale versions and invalid state transitions fail closed.

## Run locally

From the repository root:

```powershell
cd server
npm ci
npm run typecheck
npm test
```

## Evidence boundary

These tests use synthetic identities and local temporary state. They do not prove the OAuth callback, GitHub token exchange, browser cookie behavior, live fork creation, or cross-account GitHub API isolation. Those still require the two-account runbook in [per-user-github-ownership.md](per-user-github-ownership.md) and [oauth-and-contribution-live-verification.md](oauth-and-contribution-live-verification.md). Never mark those live checks complete based only on CI.
