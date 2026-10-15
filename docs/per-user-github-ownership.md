# Per-user GitHub ownership and isolation

## Product rule

Every signed-in person contributes using the GitHub account that authenticated their own session. The OAuth application's client ID and client secret identify the application during login; they are not the contributor identity and must never be used as a shared write credential.

## Current implementation audit

The backend's GitHub write routes use the access token held by the current server-side GitHub session:

- OAuth callback exchanges that user's authorization code and stores the returned token with that user's session.
- Fork creation sends the current session token to GitHub, so the fork belongs to the account that authorized the app.
- Branch creation and atomic proposal commits verify the token's GitHub identity and require the target repository to be a fork owned by that identity.
- Contribution workflows and approval records are scoped by the authenticated GitHub login.
- Pull-request creation verifies the head owner matches the authenticated account, checks that the selected head repository is a fork of the requested upstream, and requires the approved proposal commit.
- Missing sessions are rejected; the write routes do not intentionally fall back to a maintainer's personal token.

The browser receives a session cookie, not the GitHub access token. The token remains server-side. Treat server session storage and logs as sensitive; never log or return tokens, cookies, or OAuth secrets.

## Acceptance tests for every release

Run these checks with two separate GitHub test accounts, A and B, and a low-risk upstream repository that allows forks.

1. Sign in as A. Confirm the auth-me endpoint shows A and a fork is created under A's account.
2. Sign out, sign in as B in a separate browser profile. Confirm the auth-me endpoint shows B and a fork is created under B's account.
3. Verify B cannot read, approve, transition, commit, or create a PR for A's contribution workflow. The API should return not-found or authorization failure without disclosing A's private workflow details.
4. Attempt to commit to a fork owned by the other account. The request must be rejected before any branch ref is advanced.
5. Attempt PR creation with a head owner that differs from the current session. The request must be rejected.
6. Sign out or expire the session, then retry write operations. They must fail closed; no service-owner or environment-token fallback is permitted.
7. Inspect the resulting fork, branch, commit author/committer behavior, and PR head/base on GitHub. Record the tested commit SHA and pass/fail results without recording any credentials.

Automated tests and CI are necessary but do not replace the two-account live test. Until that test has been performed, report multi-account live isolation as not live-verified.

## Boundaries

- Users need sufficient GitHub permissions and must authorize the OAuth app. GitHub organization policies and repository rules may still block a fork, branch, or pull request.
- The app can only act within the scopes and permissions granted by each user.
- Do not deploy the current local-first backend publicly without a separate production security review, secure shared session storage, HTTPS, and abuse controls.