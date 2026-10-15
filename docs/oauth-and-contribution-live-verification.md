# Live OAuth and contribution-flow verification

CI passing does not prove a real GitHub OAuth, fork, commit, or pull-request flow works. Mark these integrations as not live-verified until a real-account run completes.

## Preflight
- Use Node.js 22+ and install dependencies in `server/` and `client/`.
- Configure OAuth credentials only in the ignored local `server/.env`; never log or share secrets.
- Ensure the GitHub OAuth App callback matches `GITHUB_OAUTH_CALLBACK_URL` exactly. Default: `http://localhost:5000/api/auth/github/callback`.
- Keep the browser origin consistent with `CLIENT_ORIGINS`; default frontend origin: `http://localhost:5173`.
- Verify `GET /api/health` returns `{ "status": "ok" }` before testing.

## Acceptance checklist
1. Sign in through the frontend and confirm `/api/auth/me` returns the expected account.
2. Refresh, sign out, and verify session persistence and clearing.
3. Discover an open issue in a repository where the account may contribute.
4. Analyze source and verify analysis fails closed if a selected file cannot be fetched or decoded.
5. Generate and review a proposal; inspect every proposed path and full file content.
6. Edit the proposal after approval and confirm a fingerprint mismatch forces re-approval.
7. Confirm unauthenticated, unapproved, and stale proposals cannot commit.
8. Commit explicitly and verify all proposed files land together in a branch in the user's fork.
9. Confirm approval and commit do not create a PR automatically.
10. Click **Create Pull Request** and verify the PR targets the intended upstream repository and branch.
11. Sign out and verify protected lifecycle, commit, and PR actions are rejected.

Use a low-risk issue in a repository that permits forks. Do not test against an unknown license or a repository that forbids contributions.

## Troubleshooting
- `auth=not_configured`: OAuth credentials are missing.
- `auth=failed`: cancellation, invalid state, or callback mismatch; check exact callback URL and consistent `localhost` versus `127.0.0.1`.
- `auth=unavailable`: OAuth-state storage failed; inspect sanitized backend logs.
- Callback succeeds but the session is missing: inspect cookie handling, origin consistency, and session-store availability.
- Fork/PR fails: verify account permissions and the target repository's contribution policy.

## Evidence record
Record the tested commit SHA, date, runtime/browser versions, pass/fail for each checklist step, sanitized failure details, and resulting PR URL. Never record tokens, cookies, client secrets, or private source content. Unit tests and CI are not substitutes for this real-account evidence.
