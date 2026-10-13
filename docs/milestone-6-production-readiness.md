# Milestone 6 — production security and deployment gates

## Implemented in this milestone slice
- Added an optional Upstash Redis REST adapter that requires HTTPS and uses bounded request timeouts.
- GitHub OAuth session records and one-time OAuth state can be persisted centrally with TTLs. Session cookies remain opaque, HttpOnly, SameSite=Lax; OAuth access tokens remain server-side.
- AI request limiting uses an atomic Redis script when shared Redis is configured. It supports a bounded burst window and an explicit per-user daily quota. Redis failure returns 503 rather than bypassing quotas.
- Local fallback remains available for loopback development only and its in-memory limiter is bounded to 10,000 identities.
- Security audit and AI request events are persisted in Redis as a bounded list (5,000 events, 30-day TTL) when configured. Event payloads omit prompts, source contents, and credentials.
- Production startup validates required OAuth/Redis settings, HTTPS API/callback URLs, HTTPS origin-only CORS configuration, and requires sandbox execution to remain disabled.
- Added unit tests for production config rejection, atomic quota behavior, audit retention parameters, HTTPS-only Redis URLs, and cross-process-style shared-session reads.

## Deployment is still intentionally blocked
The application still refuses non-loopback binds because the contribution lifecycle store remains a local JSON file with process-local write serialization. That state store must be migrated to a shared durable backend with atomic version checks before multi-instance or public deployment is safe. A configured Redis service and real production OAuth credentials were not available for live integration testing here. Do not bypass the bind guard.

## Operator setup
Set UPSTASH_REDIS_REST_URL to the HTTPS REST endpoint and UPSTASH_REDIS_REST_TOKEN to its secret token. Never commit either value. In production, also set NODE_ENV=production, OAuth client credentials, an HTTPS API_PUBLIC_URL, an HTTPS callback URL, and comma-separated HTTPS frontend origins. Keep SANDBOX_ENABLED=false.
