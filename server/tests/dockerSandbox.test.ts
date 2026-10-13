import assert from "node:assert/strict";
import testCase from "node:test";
import { buildSandboxDockerArgs, runSandbox, type SandboxRequest } from "../src/security/dockerSandbox.js";

testCase("Docker sandbox disables network and drops privileges", () => {
  const request: SandboxRequest = {
    runtime: "node",
    check: "test",
    files: [{ path: "package.json", content: '{"scripts":{"test":"node --test"}}' }],
  };
  const args = buildSandboxDockerArgs("C:/temp/workspace", request);
  assert.ok(args.includes("--network=none"));
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("--cap-drop=ALL"));
  assert.ok(args.includes("--security-opt=no-new-privileges"));
  assert.ok(args.includes("--pids-limit=64"));
  assert.ok(args.includes("--memory=512m"));
  assert.ok(args.includes("--cpus=1"));
  assert.ok(args.includes("--user=65532:65532"));
  assert.ok(args.includes("node:22-alpine"));
  assert.ok(args.includes("npm test"));
});

testCase("sandbox rejects path traversal without invoking Docker", async () => {
  const result = await runSandbox({
    runtime: "node",
    check: "test",
    files: [{ path: "../escape.js", content: "console.log('bad')" }, { path: "package.json", content: '{"scripts":{"test":"node --test"}}' }],
  });
  assert.equal(result.status, "failed");
  assert.match(result.summary, /unsafe relative path/i);
  assert.equal(result.durationMs, 0);
});

testCase("sandbox rejects duplicate paths", async () => {
  const result = await runSandbox({
    runtime: "node",
    check: "test",
    files: [{ path: "package.json", content: '{"scripts":{"test":"node --test"}}' }, { path: "PACKAGE.JSON", content: "{}" }],
  });
  assert.equal(result.status, "failed");
  assert.match(result.summary, /duplicate file paths/i);
});

testCase("sandbox rejects unsupported or oversized workspaces", async () => {
  const invalidRuntime = await runSandbox({
    runtime: "node",
    check: "test",
    files: [{ path: "package.json", content: "{}" }, { path: "large.js", content: "x".repeat(200_001) }],
  });
  assert.equal(invalidRuntime.status, "failed");
  assert.match(invalidRuntime.summary, /exceeds 200 KB/i);
});

testCase("Python test checks require a test file but compile checks do not", async () => {
  const testResult = await runSandbox({
    runtime: "python",
    check: "test",
    files: [{ path: "main.py", content: "print('hello')" }],
  });
  assert.match(testResult.summary, /requires at least one test file/i);

  const compileResult = await runSandbox({
    runtime: "python",
    check: "build",
    files: [{ path: "main.py", content: "print('hello')" }],
  });
  assert.doesNotMatch(compileResult.summary, /requires at least one test file/i);
});
