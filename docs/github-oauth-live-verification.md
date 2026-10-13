# Live GitHub OAuth verification

This checklist verifies the real GitHub OAuth provider and browser callback. Mocked HTTP responses cannot prove OAuth app settings, callback URLs, cookies, Redis credentials, redirects, or GitHub grants work.

## Safety boundaries

- Use a dedicated GitHub OAuth App, controlled test account, disposable test fork, and dedicated disposable Redis database.
- Do not use production Redis or an account with sensitive repository access.
- Keep the API loopback-only and `SANDBOX_ENABLED=false`. Never disable the non-loopback bind guard for testing.
- Set secrets only in the local shell or secret manager. Never share client secrets, Redis tokens, OAuth codes, cookies, or access tokens.
- The OAuth App callback must exactly match `GITHUB_OAUTH_CALLBACK_URL` including scheme, host, port, and path.

## Preflight

1. Record the release commit SHA and verify its CI is green.
2. Configure `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL`, `API_PUBLIC_URL`, and exact `CLIENT_ORIGINS`.
3. Configure HTTPS `UPSTASH_REDIS_REST_URL` and a dedicated `UPSTASH_REDIS_REST_TOKEN`.
4. Keep `SANDBOX_ENABLED=false` and confirm the API is reachable only on loopback.
5. Confirm `GET /api/auth/me` returns unauthenticated before login. Do not print environment values in logs.

## Browser login and logout

1. Start **Sign in with GitHub** from the exact configured client origin.
2. Confirm redirect to GitHub authorization with the expected client ID, exact callback URL, minimal scopes (`public_repo read:user`), and non-empty random state.
3. Complete consent using the controlled test account. Confirm callback redirects to the client origin with `auth=success`.
4. Confirm `GET /api/auth/me` returns the expected GitHub login/avatar and an expiry no more than eight hours after session creation.
5. Confirm the session cookie is HttpOnly and SameSite-protected (and Secure over HTTPS). The access token must not be returned to the browser or stored in browser storage.
6. Refresh and confirm the server-side session persists.
7. Sign out. Confirm `POST /api/auth/logout` succeeds from a trusted origin, clears the cookie, and `GET /api/auth/me` becomes unauthenticated.
8. Confirm the prior server-side session is invalidated and cannot be reused.

## Negative and failure-path checks

Use a fresh browser session for each case. Record only status/redirect outcomes, never codes or cookies.

- **State mismatch:** modify callback `state`; expect `auth=failed` and no session.
- **State replay:** reuse state after one attempt; expect failure because state is one-time.
- **OAuth denial:** cancel consent; expect failure redirect, cleared state cookie, no session.
- **Missing/oversized code:** omit code or send an oversized code; expect failure and no session.
- **Redis unavailable:** use a disposable test configuration with an unreachable Redis endpoint; login initiation must fail closed with HTTP 503, not silently fall back to process-local state.
- **Provider failure:** in a controlled local test, simulate token/user endpoint failure; expect generic failure and no token/secret in logs or authenticated session.
- **Untrusted logout origin:** logout from an origin outside `CLIENT_ORIGINS`; expect rejection and the valid session to remain intact.
- **TTL:** in disposable infrastructure, verify session expiry within eight hours and OAuth state expiry after ten minutes.

## Authenticated contribution smoke test

Only after login/logout and negative tests pass:

1. Use the controlled account and a disposable fork.
2. Discover a harmless issue and generate a proposal through the normal UI.
3. Review the diff and deterministic safety findings before approving any write.
4. Approve and confirm the branch/commit is created only in the authenticated user's fork, never the upstream repository.
5. Repeat the same idempotency request and confirm no duplicate commit; a stale branch head must fail rather than force-overwrite.
6. Do not create a public PR unless explicitly intended; PR creation is a separate user action.

## Evidence and exit criteria

Record date/time, release SHA, CI URL, OAuth callback configuration (not secrets), test account alias (not email), test fork name, pass/fail for each case, and redacted error category. Never record OAuth codes, cookies, tokens, client secrets, or source/prompt content.

Mark live OAuth verification complete only after browser login, refresh, logout invalidation, state mismatch/replay, denial/provider failure, Redis fail-closed behavior, and controlled fork contribution have all been observed and recorded. Mocked tests alone are not evidence of live readiness.

Keep the public-bind guard enabled until real Redis, backup/restore, Docker isolation, dependency audit, and adversarial security review are separately complete.
