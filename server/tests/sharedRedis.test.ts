import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { consumeDistributedQuota, persistOperationalEvent, redisCommand } from "../src/security/sharedRedis.js";

const oldUrl = process.env.UPSTASH_REDIS_REST_URL;
const oldToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const oldFetch = globalThis.fetch;
afterEach(() => {
  if (oldUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = oldUrl;
  if (oldToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = oldToken;
  globalThis.fetch = oldFetch;
});

test("distributed quota uses an atomic Redis script and reports the TTL", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  let sent: unknown;
  globalThis.fetch = (async (_input, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ result: [3, 45000] }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await consumeDistributedQuota("aose:test", 60000), { count: 3, resetMs: 45000 });
  assert.equal((sent as unknown[])[0], "EVAL");
});

test("persistent operational events are bounded and retained for thirty days", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  let sent: unknown;
  globalThis.fetch = (async (_input, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ result: 1 }), { status: 200 });
  }) as typeof fetch;
  await persistOperationalEvent({ event: "security.audit", user: "tester", status: 403 });
  const command = sent as unknown[];
  assert.equal(command[0], "EVAL");
  assert.equal(command[5], "5000");
  assert.equal(command[6], String(30 * 24 * 60 * 60));
});

test("refuses non-HTTPS Redis REST endpoints", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "http://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  await assert.rejects(() => redisCommand(["GET", "key"]), /must use HTTPS/);
});
