# Part 2 — GitHub authentication and user accounts

**Status:** implementation and automated verification complete; live-provider acceptance remains an operator-run deployment check.  
**Updated:** 2026-11-06

## Subpart completion

| Subpart | Result | Evidence |
|---|---|---|
| 2.1 GitHub OAuth login and callback | Implemented and integration-tested with mocked GitHub endpoints | server/tests/githubOAuth.integration.test.ts |
| 2.2 Secure session and token handling | Implemented; shared Redis session values use AES-256-GCM; production requires HTTPS Redis and a 32+ character encryption key | server/src/security/session.ts, server/tests/sharedSession.test.ts, server/tests/deploymentConfig.test.ts |
| 2.3 Logout, expiry, and error handling | Implemented; trusted-origin logout, one-time OAuth state, local/shared expiry, tamper rejection and fail-closed store behavior | Auth integration and shared-session tests |
| 2.4 Per-user identity and permissions | Authenticated GitHub API requests use the token from that browser's server-side session; write paths validate authenticated ownership | server/src/routes/github.ts, auth integration tests |
| 2.5 Multi-account isolation | Automated two-identity tests verify distinct sessions, token routing, independent logout and isolated contribution histories | server/tests/githubOAuth.integration.test.ts |

## Security properties covered

- OAuth state is cryptographically random, stored with a ten-minute TTL, tied to an HttpOnly SameSite=Lax cookie, and consumed once.
- The OAuth callback validates state and code before exchanging credentials.
- GitHub access tokens remain server-side; /api/auth/me returns only the authenticated login, avatar and expiry.
- Session cookies are HttpOnly and SameSite=Lax; Secure is enabled in production.
- Sessions expire after eight hours. Redis-backed records are encrypted with AES-256-GCM and authenticated integrity; malformed/tampered records are rejected.
- Production startup validates OAuth credentials, HTTPS Redis, a unique 32+ character session-encryption key, HTTPS API/callback URLs, HTTPS client origins, and sandbox disablement.
- Logout requires an allowed Origin, clears the cookie, and deletes only the presented session.
- Contribution lifecycle queries and mutations are scoped to the authenticated GitHub login. GitHub write operations use the session's token and verify the account/fork owner.

## Verification boundary — do not overstate

Automated tests use mocked GitHub provider responses and synthetic test identities. They validate our route/session behavior but do **not** prove that a deployed GitHub OAuth App is configured correctly or that GitHub grants the expected permissions.

Still required before public production launch:

1. Complete a real browser OAuth login using a dedicated test OAuth App and disposable test account.
2. Verify refresh persistence and logout in a browser over HTTPS with the configured Redis service.
3. Repeat with two real GitHub accounts in separate browser profiles and verify each account sees only its own contribution records.
4. Verify Redis outage, TTL and backup/restore behavior in a disposable environment.
5. Record redacted evidence in docs/github-oauth-live-verification.md.

Never commit or paste OAuth client secrets, access tokens, Redis tokens, encryption keys, authorization codes or session cookies. Keep the loopback bind guard and production sandbox guard enabled until the separate deployment/security review is complete.

## Exit decision

Part 2's code and automated test requirements are complete when the PR containing the current tests has green CI and CodeQL on its latest head SHA and is merged. Real OAuth/browser/Redis acceptance remains an explicit deployment gate, not something mocked CI can certify.
