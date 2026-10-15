# AI Open Source Engineer — Context Snapshot

Last revised: 2026-10-15 (UTC; repository state re-verified at 12:09 UTC)
Repository: https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-
Default branch: `main`

This file is the handoff point for future ChatGPT sessions. Read this file and the current `PROJECT_STATUS_AND_ROADMAP.md` on `main` before doing more work. GitHub is the durable source of truth; do not rely on chat history alone.

## Product purpose and safety boundary

AI Open Source Engineer is an AI-assisted open-source contribution workflow. It discovers good-first issues, analyzes repository source, proposes implementation plans and file changes, supports AI review, and can prepare a contribution in a fork. Human approval is required before the contribution is committed; opening a pull request against the upstream repository is a separate explicit user action. Do not weaken these approval boundaries.

Stack: React + TypeScript + Vite + React Router frontend; Node.js + Express + TypeScript backend; GitHub API; Gemini/OpenAI and local Ollama fallback. The backend persists owner-scoped contribution lifecycle state with version checks and idempotency. See `README.md`, `SECURITY.md`, and `PROJECT_STATUS_AND_ROADMAP.md` for the authoritative design and details.

## Latest verified repository state

- Milestone 93 is complete and merged: PR [#134](https://github.com/thakareatharv49-svg/AI-OpenSource-Engineer-/pull/134), title `test: cover Resend API-key edge cases (milestone 93)`.
- Final PR head: `b0ac77f03e23aba8bbaddbc00ec902bc405f6e37`.
- Merge commit: `caf4669dcbf5e4b083afef56fee6ee910a631549`.
- Final PR-head checks passed: backend typecheck/tests; frontend build/lint including production dependency audit; CodeQL JavaScript/TypeScript analysis and CodeQL.
- Roadmap was updated on main; latest observed roadmap blob SHA: `7c48bb04168964207f91d387efe7e2d8e7a13f65`. M93 is section 99 in the file and is marked completed.
- There were no open PRs when checked on 2026-10-15. PR #133 (old conflicting M93 branch) is closed unmerged and superseded by #134; do not reopen it.
- PR #132 completed GitHub fine-grained token pattern edge-case tests (historically also called “Milestone 92” in the roadmap) and is merged. PR #131 separately completed Twilio API-key tests. The roadmap contains historical numbering/section inconsistencies, so inspect it rather than assuming headings are sequential.

## Recent completed milestones

- M93 Resend API key edge cases — PR #134, merge `caf4669dcbf5e4b083afef56fee6ee910a631549`.
- GitHub fine-grained `github_pat_` token edge cases — PR #132, merged (PR head `7f3b5f9a30cd0ffe1c503c6af942476e996e7ac1`).
- M92 Twilio `SK` + 32 hex-character API key — PR #131, merge `2618f1fa90158a828210639e88bf437728a6ff00`.
- M91 Google OAuth `GOCSPX-` client-secret edge cases — PR #128, merge `0ad2403997cfb3f0fa9c96e347a59063eb2f8e92`.
- M90 Supabase `sb_secret_` key edge cases — PR #127, merge `e78f405d23b31f47aa8764d112085d58b97441a0`.
- Earlier recent work covered Hugging Face, GitLab deploy/runner and personal tokens, SendGrid, PyPI, npm, Stripe, JWT-like bearer tokens, Discord webhooks, and more. See the roadmap for the full audit trail.

## Current security-test area

Files inspected on 2026-10-15:
- `server/src/security/diffSafety.ts` — blob SHA `185fef5566164cc2b7520cb8a475e0d2f4a429bf`.
- `server/tests/diffSafety.test.ts` — blob SHA `12335dfc0fa6ed4c0ebb5b43b87a4d80f0b4ae0d`.

The current test-focused milestone series adds synthetic regression fixtures for existing secret-pattern detectors without changing production detector behavior. Common cases: valid-shaped values at exact minimum length and beyond; malformed/short/long near misses; invalid characters and casing; documentation and environment-variable placeholders. Pattern matching is defense in depth, not credential validation; never use real secrets in tests.

Known detector families include SendGrid `SG.`, GitLab `glpat-`, `gldt-`, `glrt-`, Hugging Face `hf_`, Supabase `sb_secret_`, Google OAuth `GOCSPX-`, Twilio `SK` plus 32 hex characters, Resend `re_`, GitHub fine-grained `github_pat_`, JWT-like bearer tokens, Stripe `sk_`/`rk_`, npm `npm_`, PyPI `pypi-`, and Discord webhook URLs. Inspect the source/tests before choosing new scope to avoid duplicating coverage.

## Next session — exact starting procedure

1. Fetch `PROJECT_STATUS_AND_ROADMAP.md` from current `main` and inspect the last entries. It has had concurrent updates and numbering collisions; M93 is the latest confirmed milestone completion in this snapshot.
2. List open PRs and recent merged PRs on GitHub before creating a branch. The last check found zero open PRs.
3. If there is no new in-progress task, continue with **Milestone 94**, selecting a genuinely uncovered, useful test/security hardening scope after inspecting the actual source and test coverage. Do not blindly assume a detector exists or invent a new production pattern just to fill a milestone.
4. Base a unique branch on latest `main`. Add synthetic tests and update the roadmap in the PR; leave production behavior unchanged unless the scope explicitly calls for a justified code change.
5. Review the full diff and wait for all relevant CI checks: backend typecheck/tests, frontend build/lint (including dependency audit where configured), and CodeQL. Fix failures and rerun checks. Merge only after checks pass; use the exact expected head SHA.
6. Verify the PR is merged and record the actual merge commit. If roadmap needs a post-merge correction, fetch the latest main file and current blob SHA first, preserve concurrent edits, then re-fetch to verify.
7. Keep this context snapshot updated when important project decisions or workflow state changes.

## Working preferences and non-negotiable workflow

- User usually asks “do next”, “complete milestone N”, or “fix CI”; act on the repo rather than returning generic instructions.
- Work milestone-by-milestone, quickly but carefully. Don’t ask the user to merge PRs; handle the merge when authorized by the established workflow and after required checks pass.
- Never claim tests passed, a PR merged, or context saved unless tool results verify it.
- If CI fails, inspect logs, fix the cause, and rerun checks before merging.
- Concurrent roadmap changes have caused conflicts. Always branch from latest main, preserve main's current roadmap, and close superseded conflicted PRs only after a clean replacement exists.
- Keep updates concise and concrete: milestone, PR link, checks, merge commit, and roadmap/context status.
- Never commit real credentials or weaken human-approval / explicit-PR boundaries.

## Related source-of-truth files

- `PROJECT_STATUS_AND_ROADMAP.md` — milestone history and current roadmap.
- `README.md` — product purpose, setup, APIs, architecture summary.
- `SECURITY.md` — security reporting and handling.
- `server/src/security/diffSafety.ts` and `server/tests/diffSafety.test.ts` — current diff-safety implementation and regression tests.


## Verified repository state — 2026-10-15 12:09 UTC

This section was refreshed by checking the live GitHub repository, README, roadmap, key safety source/test files, recent PRs, and the open-PR list.

- Repository identity is confirmed: `thakareatharv49-svg/AI-OpenSource-Engineer-`; it is public, `main` is the default branch, and the connected GitHub account has push/admin permissions.
- Product identity remains correct: an AI-assisted workflow for finding open-source issues, analyzing code, generating/reviewing concrete proposals, running bounded checks, and preparing approved contributions in a fork. Human approval before committing and a separate explicit action to create an upstream PR are non-negotiable.
- Latest completed milestone: **M93**, PR [#134](https://github.com/thakareathv49-svg/AI-OpenSource-Engineer-/pull/134), merged 2026-10-15. Verified merge commit: `caf4669dcbf5e4b083afef56fee6ee910a631549`. The PR metadata reports merged=true and records 12 additions / 3 deletions. Its description and roadmap record backend typecheck/tests, frontend build/lint with dependency audit, and CodeQL as passing on the final PR head.
- The roadmap at the time of this check had blob SHA `7c48bb04168964207f91d387efe7e2d8e7a13f65` and records M93 as completed. The context file before this update had blob SHA `e7f3f01074409c6be5de679bb331a27a618c55f8`.
- Verified source/test files currently on `main`: `server/src/security/diffSafety.ts` blob `185fef5566164cc2b7520cb8a475e0d2f4a429bf` (373 lines), and `server/tests/diffSafety.test.ts` blob `12335dfc0fa6ed4c0ebb5b43b87a4d80f0b4ae0d` (2,543 lines).
- There were **no open pull requests** at the time of verification. PR #133 is closed and unmerged; it was superseded by merged PR #134. Do not reopen the superseded branch.
- The repository status endpoint for M93's merge commit returned `pending` with zero legacy commit statuses. This is not evidence of a failed workflow, but do not use that endpoint alone to claim current CI is passing; use the PR's workflow-run/check details if current CI status matters.
- Roadmap bookkeeping needs care: the newest sections jump from 96 to 98 to 99 and use section 98 for another M92 item. Preserve historical entries; correct numbering only as a deliberate docs cleanup, not by blindly overwriting milestone history.
- Product-direction concern confirmed by the current roadmap and safety files: M81–M93 mostly add synthetic edge-case regression coverage for secret-pattern detectors, with production detector behavior unchanged. This can be useful defense-in-depth, but it is not meaningful progress toward the full issue-to-reviewed-contribution product on its own.

## Next action after this verification

Before starting M94, audit the current implementation against the product workflow and roadmap. Prioritize the highest-impact missing or unverified core capability (for example, an honest end-to-end workflow verification, contribution lifecycle reliability, or an isolated Docker smoke test) rather than inventing another secret-pattern milestone. Inspect the relevant implementation, existing tests, and current roadmap first. Clearly distinguish mocked tests from real provider/Docker runs. Do not claim a live authenticated end-to-end run or real Docker isolation has been verified unless it is actually exercised and observed.
