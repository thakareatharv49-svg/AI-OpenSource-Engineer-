# Production operations and deployment gate

This is an operator checklist, not a declaration that production deployment has been tested. The application deliberately rejects non-loopback binding today. Do not remove that guard as a deployment workaround.

## Preflight checklist

- [ ] Use a dedicated Redis database/service and a dedicated REST token with the least permissions available.
- [ ] Configure UPSTASH_REDIS_REST_URL as HTTPS and store UPSTASH_REDIS_REST_TOKEN in the deployment secret manager. Never commit either value.
- [ ] Set NODE_ENV=production, GitHub OAuth client ID/secret, an HTTPS API_PUBLIC_URL, an exact HTTPS GitHub OAuth callback URL, and a comma-separated list of exact HTTPS CLIENT_ORIGINS.
- [ ] Keep SANDBOX_ENABLED=false. Public execution of target-repository code is not approved by this milestone.
- [ ] Confirm production configuration validation fails on missing secrets, HTTP URLs, path-bearing CORS entries, and sandbox enablement.
- [ ] Keep HOST on loopback until the real Redis/OAuth flow, restore procedure, and adversarial security review are verified and recorded.
- [ ] Review CI on the exact commit intended for deployment; do not rely on an earlier PR run.

## Shared-state behavior and retention

- OAuth session keys expire after eight hours. OAuth state keys are one-time and expire after ten minutes.
- AI burst quotas and per-user daily quotas use atomic Redis increments and TTLs. If Redis fails, AI requests fail closed with HTTP 503 rather than bypassing quota enforcement.
- Security audit and AI request events are capped at 5,000 entries and have a 30-day Redis TTL. Event payloads intentionally omit prompts, source contents, and credentials.
- Shared contribution lifecycle state uses compare-and-set writes and bounded retention of 50 records and 20 events per record. The local loopback development fallback uses a private atomic-write JSON file.
- Redis-backed unit tests mock the REST API. They do not verify provider connectivity, credentials, Redis ACLs, persistence settings, or actual restore behavior.

## Backup and restore policy

Before production is considered, select a Redis plan with a documented backup/export capability and define an owner for backups. Do not assume automatic backups are enabled by default.

1. Enable the provider-supported backup/export feature, if available for the selected plan, and record its retention and recovery-point guarantees.
2. Before a release that changes shared-state schema, export a backup using the provider's documented mechanism.
3. Restore the export into a separate staging Redis database; never test restore by overwriting production.
4. Verify that sessions and OAuth state remain TTL-bounded, lifecycle records parse and retain version numbers/events, quota keys retain their TTLs, and audit events contain no credentials or source content.
5. Record the restore duration and recovery point, and repeat at least quarterly and after schema changes.
6. If the chosen plan cannot provide an acceptable backup/restore guarantee, do not deploy publicly.

## Incident response

### Redis REST token or store access suspected compromised
1. Keep the application loopback-only or take the affected deployment offline.
2. Revoke/rotate the Redis REST token using the provider console and update the deployment secret store.
3. Review provider access/audit logs and the bounded security audit list for unexpected write volume or configuration changes.
4. Rotate GitHub OAuth credentials if their exposure cannot be ruled out; revoke affected GitHub grants and invalidate stored sessions by deleting the session-key namespace.
5. Restore from a known-good backup only after the cause is understood; document impact and recovery.

### AI quota suddenly exhausted or Redis unavailable
1. Do not disable the quota middleware; shared-store failure intentionally returns 503.
2. Check Redis availability, latency, quota keys/TTLs, and provider rate limits.
3. If quota abuse is suspected, preserve audit evidence, rotate relevant credentials only if compromise is plausible, and adjust documented limits after review.
4. Record the incident, user impact, and any limit changes.

### Unexpected lifecycle conflicts or corrupted state
1. Keep the service loopback-only and preserve the current Redis value/export before changes.
2. Inspect compare-and-set conflict rates and recent audit events without exposing OAuth tokens.
3. Restore only into staging first and validate record versions/idempotency keys before any recovery in the active store.

## Release gate

Do not claim production readiness until a live Redis integration test, real GitHub OAuth login/logout, lifecycle concurrent-writer/restart test, backup restore drill, sandbox-disabled verification, dependency audit, and adversarial security review have all been recorded against the release commit.
