import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createContribution,
  listContributions,
  transitionContribution,
} from "../src/security/contributionLifecycle.js";
import {
  clearGithubSession,
  consumeOAuthState,
  createGithubSession,
  createOAuthState,
  getGithubSession,
  persistGithubSession,
  persistOAuthState,
  sessionCookieNameForTests,
} from "../src/security/session.js";
import { consumeDistributedQuota, persistOperationalEvent, redisCommand, sharedRedisConfigured } from "../src/security/sharedRedis.js";

const confirmation = "I_UNDERSTAND_THIS_USES_A_DISPOSABLE_REDIS";
if (process.env.AOSE_LIVE_REDIS_VERIFY !== confirmation) {
  throw new Error(`Refusing live integration checks. Set AOSE_LIVE_REDIS_VERIFY=${confirmation} only when the configured Redis database is disposable and dedicated to this test.`);
}
if (!sharedRedisConfigured()) {
  throw new Error("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for the disposable HTTPS Redis REST database.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run this harness with NODE_ENV=production.");
}

const runId = randomUUID();
const passed: string[] = [];
const mark = (name: string) => { passed.push(name); console.log(`PASS ${name}`); };

const quotaKey = `aose:live-verify:${runId}:quota`;
const first = await consumeDistributedQuota(quotaKey, 60_000);
const second = await consumeDistributedQuota(quotaKey, 60_000);
assert.equal(first.count, 1);
assert.equal(second.count, 2);
assert.ok(first.resetMs > 0);
assert.ok(second.resetMs > 0);
mark("real Redis atomic quota increment and TTL");

const session = createGithubSession({
  login: `live-verify-${runId}`,
  avatarUrl: null,
  accessToken: `synthetic-token-${runId}`,
});
await persistGithubSession(session);
const sessionRequest = { headers: { cookie: `${sessionCookieNameForTests()}=${session.id}` } } as never;
const remoteSession = await getGithubSession(sessionRequest);
assert.equal(remoteSession?.id, session.id);
assert.equal(remoteSession?.login, session.login);
assert.equal(remoteSession?.accessToken, session.accessToken);
await clearGithubSession(sessionRequest, { append: () => undefined } as never);
assert.equal(await getGithubSession(sessionRequest), null);
mark("real Redis session persistence, retrieval, and deletion");

const state = createOAuthState();
await persistOAuthState(state);
const stateRequest = { headers: { cookie: `aose_oauth_state=${encodeURIComponent(state)}` } } as never;
assert.equal(await consumeOAuthState(stateRequest, state), true);
assert.equal(await consumeOAuthState(stateRequest, state), false);
mark("real Redis OAuth state is one-time");

const lifecycleInput = {
  user: `live-verify-${runId}`,
  idempotencyKey: `live-verify-${runId}`,
  issueUrl: `https://github.com/example/repository/issues/1?live-verify=${runId}`,
  repository: "example/repository",
};
const created = await createContribution(lifecycleInput);
const repeated = await createContribution(lifecycleInput);
assert.equal(created.reused, false);
assert.equal(repeated.reused, true);
assert.equal(repeated.record.id, created.record.id);
const changed = await transitionContribution({
  user: lifecycleInput.user,
  id: created.record.id,
  to: "analyzing",
  expectedVersion: created.record.version,
  message: `live readiness check ${runId}`,
});
assert.equal(changed.version, created.record.version + 1);
const reloaded = (await listContributions(lifecycleInput.user)).find((item) => item.id === created.record.id);
assert.equal(reloaded?.version, changed.version);
assert.equal(reloaded?.state, "analyzing");
mark("real Redis lifecycle create, idempotency, transition, and reload");

const auditMarker = `live-verify-${runId}`;
await persistOperationalEvent({ event: auditMarker, verification: true, at: new Date().toISOString() });
const events = await redisCommand<string[]>(["LRANGE", "aose:ops:audit:v1", "0", "4999"]);
assert.ok(Array.isArray(events));
assert.ok(events.some((entry) => entry.includes(auditMarker)));
mark("real Redis operational-event persistence");

await redisCommand(["DEL", quotaKey]);
console.log(`\nCompleted ${passed.length} live Redis checks. Run ID: ${runId}`);
console.log("This test intentionally leaves one uniquely named lifecycle record and one audit event. Use a disposable Redis database, not a production/shared database.");
