import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lifecycleRouter from "../src/routes/lifecycle.js";

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;
let tempDir: string;
const previousStatePath = process.env.CONTRIBUTION_STATE_PATH;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "lifecycle-route-integration-"));
  process.env.CONTRIBUTION_STATE_PATH = join(tempDir, "state.json");
  const app = express();
  app.use(express.json());
  // Exercise the real router over HTTP while supplying its documented session shape.
  // OAuth cookie/session validation remains covered separately by the auth middleware.
  app.use((req, res, next) => {
    const login = req.header("x-test-github-login");
    res.locals.githubSession = login ? { login } : null;
    next();
  });
  app.use("/api/lifecycle", lifecycleRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api/lifecycle`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (previousStatePath === undefined) delete process.env.CONTRIBUTION_STATE_PATH;
  else process.env.CONTRIBUTION_STATE_PATH = previousStatePath;
  await rm(tempDir, { recursive: true, force: true });
});

async function request(path: string, options: RequestInit = {}, login?: string) {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (login) headers.set("x-test-github-login", login);
  const response = await fetch(baseUrl + path, { ...options, headers });
  return { response, body: await response.json() as Record<string, any> };
}

function createBody(idempotencyKey = "route-test-12345678", issue = 42) {
  return {
    idempotencyKey,
    issueUrl: `https://github.com/example/project/issues/${issue}`,
    repository: "example/project",
  };
}

test("lifecycle API requires an authenticated GitHub session", async () => {
  const { response, body } = await request("/");
  assert.equal(response.status, 401);
  assert.equal(body.code, "AUTH_REQUIRED");
});

test("lifecycle API validates create payloads before persisting", async () => {
  const { response } = await request("/", {
    method: "POST",
    body: JSON.stringify({ ...createBody(), issueUrl: "https://example.com/issue/1" }),
  }, "alice");
  assert.equal(response.status, 400);
});

test("lifecycle API creates and idempotently reuses a workflow over HTTP", async () => {
  const first = await request("/", { method: "POST", body: JSON.stringify(createBody()) }, "alice");
  assert.equal(first.response.status, 201);
  assert.equal(first.body.reused, false);
  const second = await request("/", { method: "POST", body: JSON.stringify(createBody()) }, "alice");
  assert.equal(second.response.status, 200);
  assert.equal(second.body.reused, true);
  assert.equal(second.body.contribution.id, first.body.contribution.id);
  assert.equal(second.body.contribution.version, 1);
});

test("lifecycle API scopes reads and transitions to the signed-in user", async () => {
  const created = await request("/", {
    method: "POST",
    body: JSON.stringify(createBody("owner-scope-12345678", 43)),
  }, "alice");
  const id = created.body.contribution.id as string;
  const hidden = await request(`/${id}`, {}, "bob");
  assert.equal(hidden.response.status, 404);
  const forbiddenTransition = await request(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "analyzing", expectedVersion: 1 }),
  }, "bob");
  assert.equal(forbiddenTransition.response.status, 404);
  const visible = await request(`/${id}`, {}, "alice");
  assert.equal(visible.response.status, 200);
  assert.equal(visible.body.contribution.id, id);
});

test("lifecycle API enforces valid transitions and optimistic concurrency over HTTP", async () => {
  const created = await request("/", {
    method: "POST",
    body: JSON.stringify(createBody("version-check-12345678", 44)),
  }, "alice");
  const id = created.body.contribution.id as string;
  const invalid = await request(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "commit_complete", expectedVersion: 1 }),
  }, "alice");
  assert.equal(invalid.response.status, 409);
  const changed = await request(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "analyzing", expectedVersion: 1, message: "Integration test started" }),
  }, "alice");
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.contribution.state, "analyzing");
  assert.equal(changed.body.contribution.version, 2);
  const stale = await request(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "planning", expectedVersion: 1 }),
  }, "alice");
  assert.equal(stale.response.status, 409);
});

test("lifecycle API rejects malformed transition versions and unknown states", async () => {
  const created = await request("/", {
    method: "POST",
    body: JSON.stringify(createBody("invalid-transition-12345678", 45)),
  }, "alice");
  const id = created.body.contribution.id as string;
  for (const payload of [
    { state: "analyzing", expectedVersion: 0 },
    { state: "unknown_state", expectedVersion: 1 },
    { state: "analyzing", expectedVersion: 1.5 },
  ]) {
    const result = await request(`/${id}`, { method: "PATCH", body: JSON.stringify(payload) }, "alice");
    assert.equal(result.response.status, 400);
  }
});
