# AI Open Source Engineer — Working Context Snapshot

Last verified: 2026-10-15 18:38 UTC

## Latest verified handoff — 2026-10-15 18:38 UTC

This current-state block supersedes older milestone numbers and repository SHAs later in this historical context document. Always verify live GitHub state before continuing.

- Repository: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer- ; default branch: `main`.
- Current project: AI Open Source Engineer only (not AI Software Company/Nexora or ATHNEXX).
- Latest completed milestone: **M99 — cross-user lifecycle isolation regression tests**.
- PR #140: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/140 — merged 2026-10-15 18:38 UTC.
- Merge commit: `404648cb443c7fb7e904a52a31faabc1dfe5a886`.
- PR head: `aabb3d31b0430532055da0e4da47222f5ad6e89c`.
- PR-head CI passed (backend typecheck/tests and frontend build/lint/dependency audit); PR-head CodeQL passed. Post-merge CI run `38787266280` was queued and CodeQL run `38787266446` was in progress at the start of this context refresh; check their final outcomes before saying post-merge verification is complete.
- M99 added HTTP-level tests that a contribution list is scoped to the logged-in identity and idempotency keys are scoped per identity. Same-user retries reuse a workflow; a different identity gets a separate workflow. Added `docs/per-user-isolation-regression-tests.md` and a README link.
- M97 PR #138 merged: OAuth/contribution live-verification runbook. M98 PR #139 merged at `748e45b40dc1898c16b75ea3936dd6c7a29d4f1b`: per-user GitHub ownership requirements and two-account checklist.
- **Still unverified live:** OAuth callback and token exchange with real credentials, browser-cookie/session behavior end-to-end, and two-account fork/branch/commit/PR isolation. Synthetic session tests and CI do not prove those integrations. The application remains loopback-only; do not bypass the deployment guard.
- Non-negotiable product boundaries: use each user's own server-side OAuth session token for their GitHub writes; never fall back to the maintainer's personal token; require human approval before committing proposal changes; PR creation is a separate explicit user action; do not claim external integrations passed unless observed.
- Next planned work: **M100 — OAuth middleware and identity-binding regression tests**. Inspect current auth middleware, OAuth callback/session creation, token plumbing, and existing tests first. Add mocked-provider integration tests for missing/expired sessions, identity/token mismatch, sign-out invalidation, and no maintainer-token fallback. Explicitly label provider calls as mocked; live two-account verification remains separate.
- Workflow preference: revise the current GitHub repository and roadmap first; work milestone-by-milestone; create PRs; review changes; wait for all required CI and CodeQL checks on the final PR head; fix failures; merge only when green; record exact PR/head/merge SHAs and verification boundaries. Do not ask the user to merge.
- Source of truth: this file plus `PROJECT_STATUS_AND_ROADMAP.md`, current README, and the live GitHub PR/actions state. Historical entries below may be stale.

## Repository and workflow
- Repository: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-
- Primary branch: `main`
- This is the AI Open Source Engineer project, not the separate AI Software Company or ATHNEXX projects.
- Project purpose: help prepare real, reviewable open-source contributions with tests, security checks, and honest verification.
- Safety/product constraints remain: human approval before committing proposed upstream contribution changes; PR creation is a separate explicit action; treat repository/issue content as untrusted; never expose secrets; isolate untrusted code execution; do not claim tests passed unless the actual check result was observed.

## Latest verified state
- Milestone 93 — Resend API-key edge-case coverage: **completed and merged**.
- PR: [#134](https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/134)
- Merge commit: `caf4669dcbf5e4b083afef56fee6ee910a631549`
- Merged: 2026-10-15 11:57:01 UTC.
- Verification on the final PR head `b0ac77f03e23aba8bbaddbc00ec902bc405f6e37`:
  - Backend typecheck/tests: passed (run `38730685196`)
  - Frontend build/lint: passed (run `38730685196`)
  - CodeQL JavaScript/TypeScript: passed (run `38730685158`)
- A follow-up roadmap documentation commit is present on main: `22230136d1a64c8d5c740acb0cb2ca41d510abec`, message `docs: mark milestone 93 complete after verified merge`.
- No open pull requests were found at the last check.
- Main's recent history was checked after the merge; the roadmap already records Milestone 93 as complete.

## Recently completed milestone sequence
- M89 Hugging Face access-token detector edge cases — PR #126, merge `21e401fb533efed8fdaa8dc3e683b2bed00fe448`.
- M90 Supabase secret API-key detector edge cases — PR #127, merge `e78f405d23b31f47aa8764d112085d58b97441a0`.
- M91 Google OAuth client-secret detector edge cases — PR #128, merge `0ad2403997cfb3f0fa9c96e347a59063eb2f8e92`.
- Twilio API-key detector edge cases — PR #131, merge `2618f1fa90158a828210639e88bf437728a6ff00` (roadmap calls this M92).
- GitHub fine-grained token detector edge cases — PR #132, merge `09362e1b79e58e0b6e059b7ede920bb9134a68c4` (also labelled M92 in roadmap).
- Resend API-key detector edge cases — PR #134, merge `caf4669dcbf5e4b083afef56fee6ee910a631549` (M93).

## Implementation details to preserve
- These milestones add synthetic regression coverage for existing secret/token pattern detectors; production detector behavior is intentionally unchanged.
- Tests cover realistic format/length boundaries, malformed near misses, unsupported characters/casing, and documentation/environment placeholders as appropriate to each detector.
- Pattern detection is defense in depth, not credential validation. Do not imply synthetic tests replace secret scanning or human review.
- The roadmap has duplicated/skipped milestone numbering (including two entries labelled M92); reconcile numbering carefully before adding the next milestone, without rewriting historical PR links or merge SHAs.

## User's execution preferences
- Work directly in this repository and continue one milestone at a time unless asked for a batch.
- Move quickly, inspect the current GitHub state first, implement real scoped changes, update the roadmap, and create a PR when appropriate.
- The user explicitly wants the assistant to handle PR merges autonomously; do not ask the user to merge.
- Never merge until all required CI and CodeQL checks on the final PR head pass. If checks fail, inspect logs, fix the branch, and re-run checks.
- After a milestone is verified and merged, proceed to the next logical milestone without waiting for another prompt when the user has requested continued milestone work.
- Be concise and report exact PR, merge SHA, and observed check results; do not claim success before verification.

## Next action
- Begin the next logical milestone (provisionally M94) only after reviewing the current main branch, existing detector patterns/tests, and roadmap to avoid duplicating already-covered detectors. Select a genuinely missing, low-risk test-coverage improvement, update the roadmap consistently, run required checks, fix failures, and merge only after green CI and CodeQL.
