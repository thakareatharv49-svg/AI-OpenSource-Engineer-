import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createContribution, listContributions, transitionContribution } from "../src/security/contributionLifecycle.js";

const oldUrl = process.env.UPSTASH_REDIS_REST_URL;
const oldToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const oldFetch = globalThis.fetch;
let storeRaw: string | null = null;
let failFirstCas = false;
let casAttempts = 0;

function configureRedisMock() {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  storeRaw = null;
  failFirstCas = false;
  casAttempts = 0;
  globalThis.fetch = (async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    if (command[0] === "GET") return new Response(JSON.stringify({ result: storeRaw }), { status: 200 });
    if (command[0] === "EVAL") {
      casAttempts += 1;
      if (failFirstCas && casAttempts === 1) return new Response(JSON.stringify({ result: 0 }), { status: 200 });
      const expected = command[4] === "__AOSE_STORE_MISSING__" ? null : String(command[4]);
      if (expected !== storeRaw) return new Response(JSON.stringify({ result: 0 }), { status: 200 });
      storeRaw = String(command[5]);
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }
    throw new Error("Unexpected Redis command");
  }) as typeof fetch;
}

afterEach(() => {
  if (oldUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = oldUrl;
  if (oldToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = oldToken;
  globalThis.fetch = oldFetch;
  storeRaw = null;
});

test("shared lifecycle store atomically creates, reuses, lists, and transitions records", async () => {
  configureRedisMock();
  const input = { user: "shared-user", idempotencyKey: "shared-key-0001", issueUrl: "https://github.com/example/project/issues/1", repository: "example/project" };
  const created = await createContribution(input);
  assert.equal(created.reused, false);
  const reused = await createContribution(input);
  assert.equal(reused.reused, true);
  assert.equal(reused.record.id, created.record.id);
  assert.equal((await listContributions("shared-user")).length, 1);
  const changed = await transitionContribution({ user: "shared-user", id: created.record.id, to: "analyzing", expectedVersion: 1 });
  assert.equal(changed.version, 2);
  await assert.rejects(
    () => transitionContribution({ user: "shared-user", id: created.record.id, to: "planning", expectedVersion: 1 }),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 409,
  );
});

test("shared lifecycle CAS retries a transient cross-instance write conflict", async () => {
  configureRedisMock();
  failFirstCas = true;
  const result = await createContribution({
    user: "cas-user", idempotencyKey: "cas-key-0001",
    issueUrl: "https://github.com/example/project/issues/2", repository: "example/project",
  });
  assert.equal(result.record.state, "discovered");
  assert.equal(casAttempts, 2);
});
