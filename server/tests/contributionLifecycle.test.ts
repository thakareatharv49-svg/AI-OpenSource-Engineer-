import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearContributionStoreForTests, createContribution, getContribution, listContributions, transitionContribution } from "../src/security/contributionLifecycle.js";
let tempDir: string;
const previousPath = process.env.CONTRIBUTION_STATE_PATH;
before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "contribution-lifecycle-"));
  process.env.CONTRIBUTION_STATE_PATH = join(tempDir, "state.json");
  await clearContributionStoreForTests();
});
after(async () => {
  if (previousPath === undefined) delete process.env.CONTRIBUTION_STATE_PATH;
  else process.env.CONTRIBUTION_STATE_PATH = previousPath;
  await rm(tempDir, { recursive: true, force: true });
});
const input = { user: "test-user", idempotencyKey: "issue-12345678", issueUrl: "https://github.com/example/project/issues/123", repository: "example/project" };
test("creates a durable workflow and scopes reads to its owner", async () => {
  const created = await createContribution(input);
  assert.equal(created.reused, false);
  assert.equal(created.record.state, "discovered");
  assert.equal(await getContribution("other-user", created.record.id), null);
  assert.equal((await listContributions("test-user")).length, 1);
  assert.equal((await getContribution("test-user", created.record.id))?.id, created.record.id);
});
test("idempotent create returns the original workflow and rejects key reuse for another issue", async () => {
  const first = await createContribution(input);
  const duplicate = await createContribution(input);
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.record.id, first.record.id);
  await assert.rejects(createContribution({ ...input, issueUrl: "https://github.com/example/project/issues/124" }), /Idempotency key was already used/);
});
test("enforces lifecycle transitions and optimistic version checks", async () => {
  const { record } = await createContribution({ ...input, idempotencyKey: "issue-22345678" });
  await assert.rejects(transitionContribution({ user: input.user, id: record.id, to: "commit_complete", expectedVersion: record.version }), /Invalid lifecycle transition/);
  const analyzing = await transitionContribution({ user: input.user, id: record.id, to: "analyzing", expectedVersion: record.version, message: "Analysis started" });
  assert.equal(analyzing.version, record.version + 1);
  await assert.rejects(transitionContribution({ user: input.user, id: record.id, to: "planning", expectedVersion: record.version }), /changed since it was loaded/);
});
test("records retryable failures and allows an explicit retry transition", async () => {
  const { record } = await createContribution({ ...input, idempotencyKey: "issue-32345678" });
  const analyzing = await transitionContribution({ user: input.user, id: record.id, to: "analyzing", expectedVersion: record.version });
  const retryable = await transitionContribution({ user: input.user, id: record.id, to: "retryable", expectedVersion: analyzing.version, message: "GitHub rate limit" });
  assert.equal(retryable.retryCount, 1);
  assert.equal(retryable.lastError, "GitHub rate limit");
  const resumed = await transitionContribution({ user: input.user, id: record.id, to: "analyzing", expectedVersion: retryable.version, message: "Retry started" });
  assert.equal(resumed.state, "analyzing");
  assert.equal(resumed.lastError, null);
  assert.ok(resumed.events.length >= 4);
});
test("redacts credential-like values from lifecycle messages", async () => {
  const { record } = await createContribution({ ...input, idempotencyKey: "issue-52345678" });
  const analyzing = await transitionContribution({ user: input.user, id: record.id, to: "analyzing", expectedVersion: record.version });
  const failed = await transitionContribution({ user: input.user, id: record.id, to: "retryable", expectedVersion: analyzing.version, message: "token=ghp_abcdefghijklmnopqrstuvwxyz123456" });
  assert.doesNotMatch(failed.lastError ?? "", /ghp_/);
});
test("rejects writes from another user and serializes concurrent stale updates", async () => {
  const { record } = await createContribution({ ...input, idempotencyKey: "issue-42345678" });
  await assert.rejects(transitionContribution({ user: "attacker", id: record.id, to: "analyzing", expectedVersion: record.version }), /not found/);
  const results = await Promise.allSettled([
    transitionContribution({ user: input.user, id: record.id, to: "analyzing", expectedVersion: record.version }),
    transitionContribution({ user: input.user, id: record.id, to: "analyzing", expectedVersion: record.version }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
});

test("contribution state survives a separate Node process restart", async () => {
  const { record } = await createContribution({ ...input, idempotencyKey: "restart-12345678" });
  await transitionContribution({
    user: input.user,
    id: record.id,
    to: "analyzing",
    expectedVersion: record.version,
    message: "Persist before restart",
  });
  const moduleUrl = new URL("../src/security/contributionLifecycle.ts", import.meta.url).href;
  const childCode = "const mod = await import(" + JSON.stringify(moduleUrl) + "); console.log(JSON.stringify(await mod.listContributions('test-user')));";
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", childCode], {
    encoding: "utf8",
    env: { ...process.env, CONTRIBUTION_STATE_PATH: process.env.CONTRIBUTION_STATE_PATH },
  });
  assert.equal(child.status, 0, child.stderr);
  const records = JSON.parse(child.stdout.trim()) as Array<{ id: string; state: string; version: number; events: unknown[] }>;
  const restored = records.find(item => item.id === record.id);
  assert.ok(restored, "the child process should read the persisted contribution");
  assert.equal(restored.state, "analyzing");
  assert.equal(restored.version, record.version + 1);
  assert.ok(restored.events.length >= 2);
});
