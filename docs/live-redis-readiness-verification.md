# Live shared-Redis readiness verification

This is a **manual, opt-in integration test against a real Redis REST service**. CI does not run it because CI uses mocked Redis responses. It must be run only against a dedicated disposable Redis database: the lifecycle API stores records in a shared global document, and audit events are written to a shared bounded list.

## Prerequisites

- Node.js 22 and dependencies installed in `server/` (`npm ci`).
- A dedicated temporary Upstash Redis database, with an HTTPS REST URL and a restricted token.
- Do not use production, staging, or any Redis database containing real user sessions or contribution records.
- Do not enable sandbox execution or expose the API publicly for this check.

## Run

From PowerShell at the repository root, set the disposable database credentials in the current shell (do not paste credentials into chat or commit them):

```powershell
$env:UPSTASH_REDIS_REST_URL = "https://YOUR-DISPOSABLE-REDIS.upstash.io"
$env:UPSTASH_REDIS_REST_TOKEN = "YOUR-DISPOSABLE-REDIS-TOKEN"
$env:NODE_ENV = "test"
$env:AOSE_LIVE_REDIS_VERIFY = "I_UNDERSTAND_THIS_USES_A_DISPOSABLE_REDIS"
cd server
npm ci
npx tsx scripts/verify-live-redis.ts
```

The script checks actual atomic quota increments and TTLs, shared session write/read/delete, one-time OAuth-state consumption, lifecycle creation/idempotency/transition/reload, and audit-event persistence. It removes its unique quota key after success. It deliberately leaves one uniquely named lifecycle record and one audit event; the database must therefore be disposable. Do not run this against a database that holds real application data.

A successful run prints a `PASS` line for every check and a final count. Save the terminal output and record the commit SHA and date in the project status. A failure is a failed live integration check; do not mark it passed based on unit tests.

## What this does not verify

- Real GitHub OAuth consent/callback/login/logout or a real authenticated fork/commit flow. Those require configured OAuth credentials and a controlled test GitHub account/fork; complete the manual steps in [production operations](./production-operations.md).
- Provider backup/export or restore. Perform the restore into a separate disposable database and record recovery point and duration.
- Docker host isolation. Follow [the sandbox smoke test](./isolated-sandbox.md) separately.
- Full adversarial security review or approval for public deployment.

Keep the application's non-loopback bind guard enabled. This harness tests Redis modules directly and is not a deployment approval.
