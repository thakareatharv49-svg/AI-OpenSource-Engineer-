import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createGithubSession, getGithubSession, persistGithubSession, sessionCookieNameForTests } from "../src/security/session.js";

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

test("shared session persistence stores an expiring server-side credential record", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const session = createGithubSession({ login: "shared-session-test", avatarUrl: null, accessToken: "server-only-token" });
  let command: unknown[] = [];
  globalThis.fetch = (async (_input, init) => {
    command = JSON.parse(String(init?.body)) as unknown[];
    return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
  }) as typeof fetch;
  await persistGithubSession(session);
  assert.equal(command[0], "SET");
  assert.equal(command[1], `aose:session:${session.id}`);
  assert.ok(String(command[2]).includes("server-only-token"));
  assert.equal(command[3], "PX");
  assert.ok(Number(command[4]) > 0);
});

test("session reads use the shared store rather than relying on this process memory", async () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  const session = {
    id: "shared-id-not-in-local-map", login: "remote-user", avatarUrl: null,
    accessToken: "remote-token", createdAt: Date.now(), expiresAt: Date.now() + 60000,
  };
  globalThis.fetch = (async () => new Response(JSON.stringify({ result: JSON.stringify(session) }), { status: 200 })) as typeof fetch;
  const request = { headers: { cookie: `${sessionCookieNameForTests()}=${session.id}` } } as never;
  assert.deepEqual(await getGithubSession(request), session);
});
