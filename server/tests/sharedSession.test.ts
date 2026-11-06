import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createGithubSession, getGithubSession, persistGithubSession, sessionCookieNameForTests } from "../src/security/session.js";

const envKeys = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "SESSION_ENCRYPTION_KEY"] as const;
const oldEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const oldFetch = globalThis.fetch;

afterEach(() => {
  for (const [key, value] of oldEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = oldFetch;
});

function configureRedis() {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  process.env.SESSION_ENCRYPTION_KEY = "test-session-encryption-key-at-least-32-chars";
}

test("shared session credentials are encrypted at rest and can be read by another process", async () => {
  configureRedis();
  const session = createGithubSession({ login: "shared-session-test", avatarUrl: null, accessToken: "server-only-token" });
  let command: unknown[] = [];
  globalThis.fetch = (async (_input, init) => {
    command = JSON.parse(String(init?.body)) as unknown[];
    return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
  }) as typeof fetch;
  await persistGithubSession(session);

  assert.equal(command[0], "SET");
  assert.equal(command[1], `aose:session:${session.id}`);
  const encrypted = String(command[2]);
  assert.match(encrypted, /^enc-v1:/);
  assert.equal(encrypted.includes("server-only-token"), false);
  assert.equal(command[3], "PX");
  assert.ok(Number(command[4]) > 0);

  globalThis.fetch = (async () => new Response(JSON.stringify({ result: encrypted }), { status: 200 })) as typeof fetch;
  const request = { headers: { cookie: `${sessionCookieNameForTests()}=${session.id}` } } as never;
  assert.deepEqual(await getGithubSession(request), session);
});

test("tampered encrypted session records are rejected and deleted", async () => {
  configureRedis();
  const calls: unknown[][] = [];
  globalThis.fetch = (async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    calls.push(command);
    if (command[0] === "GET") return new Response(JSON.stringify({ result: "enc:v1:tampered" }), { status: 200 });
    return new Response(JSON.stringify({ result: 1 }), { status: 200 });
  }) as typeof fetch;
  const request = { headers: { cookie: `${sessionCookieNameForTests()}=tampered-session` } } as never;
  assert.equal(await getGithubSession(request), null);
  assert.equal(calls[0]?.[0], "GET");
  assert.deepEqual(calls[1], ["DEL", "aose:session:tampered-session"]);
});

test("expired shared sessions are rejected and deleted", async () => {
  configureRedis();
  const session = createGithubSession({ login: "expired-user", avatarUrl: null, accessToken: "expired-token" });
  session.expiresAt = Date.now() - 1000;
  let encrypted = "";
  globalThis.fetch = (async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    if (command[0] === "SET") { encrypted = String(command[2]); return new Response(JSON.stringify({ result: "OK" }), { status: 200 }); }
    if (command[0] === "GET") return new Response(JSON.stringify({ result: encrypted }), { status: 200 });
    return new Response(JSON.stringify({ result: 1 }), { status: 200 });
  }) as typeof fetch;
  await persistGithubSession(session);
  const request = { headers: { cookie: `${sessionCookieNameForTests()}=${session.id}` } } as never;
  assert.equal(await getGithubSession(request), null);
});

test("process-local sessions expire and cannot be read after expiry", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const session = createGithubSession({ login: "local-expiry-user", avatarUrl: null, accessToken: "local-only-token" });
  const request = { headers: { cookie: `${sessionCookieNameForTests()}=${session.id}` } } as never;
  assert.equal((await getGithubSession(request))?.login, "local-expiry-user");
  session.expiresAt = Date.now() - 1;
  assert.equal(await getGithubSession(request), null);
});
