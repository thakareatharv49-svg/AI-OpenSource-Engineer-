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
  assert.ok(args.includes("/workspace:rw,nosuid,nodev,size=128m,mode=1777"));
  assert.ok(args.includes("type=bind,src=C:/temp/workspace,dst=/input,readonly"));
  assert.ok(args.includes("cp -R /input/. /workspace/ && npm test"));
  assert.ok(args.includes("node:22-alpine"));
  assert.ok(args.includes("cp -R /input/. /workspace/ && npm test"));
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


import { EventEmitter } from "node:events";
import { access } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";

function createMockSpawn(mode: "pass" | "fail" | "timeout" | "large-output") {
  const calls: Array<{ command: string; args: string[] }> = [];
  const spawnProcess = ((command: string, args: string[]) => {
    calls.push({ command, args });
    const child = new EventEmitter() as any;
    if (args[0] === "kill") {
      setImmediate(() => child.emit("close", 0));
      return child;
    }
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    if (mode !== "timeout") {
      setImmediate(() => {
        child.stdout.write(mode === "large-output" ? "x".repeat(40_000) : "sandbox stdout");
        child.stderr.write(mode === "large-output" ? "y".repeat(40_000) : "sandbox stderr");
        child.emit("close", mode === "fail" ? 2 : 0);
      });
    }
    return child;
  }) as typeof spawn;
  return { spawnProcess, calls };
}

testCase("sandbox captures process output and removes the temporary workspace", async () => {
  const mock = createMockSpawn("pass");
  const result = await runSandbox({
    runtime: "node",
    check: "test",
    files: [{ path: "package.json", content: '{"scripts":{"test":"node --test"}}' }],
  }, { spawnProcess: mock.spawnProcess });

  assert.equal(result.status, "passed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, "sandbox stdout");
  assert.equal(result.stderr, "sandbox stderr");
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].command, "docker");
  const mount = mock.calls[0].args.find((arg) => arg.startsWith("type=bind,src="));
  assert.ok(mount);
  assert.match(mount!, /,dst=\/input,readonly$/);
  const workspace = mount!.slice("type=bind,src=".length).split(",dst=/input,readonly")[0];
  await assert.rejects(access(workspace));
});

testCase("sandbox reports non-zero exit codes as failed checks", async () => {
  const mock = createMockSpawn("fail");
  const result = await runSandbox({
    runtime: "node",
    check: "test",
    files: [{ path: "package.json", content: '{"scripts":{"test":"node --test"}}' }],
  }, { spawnProcess: mock.spawnProcess });
  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 2);
});

testCase("sandbox timeout requests container termination and reports timed_out", async () => {
  const mock = createMockSpawn("timeout");
  const result = await runSandbox({
    runtime: "node",
    check: "test",
    timeoutMs: 1000,
    files: [{ path: "package.json", content: '{"scripts":{"test":"node --test"}}' }],
  }, { spawnProcess: mock.spawnProcess });

  assert.equal(result.status, "timed_out");
  assert.ok(mock.calls.some((call) => call.args[0] === "kill"));
});


testCase("sandbox bounds captured stdout and stderr", async () => {
  const mock = createMockSpawn("large-output");
  const result = await runSandbox({
    runtime: "node",
    check: "test",
    files: [{ path: "package.json", content: '{"scripts":{"test":"node --test"}}' }],
  }, { spawnProcess: mock.spawnProcess });

  assert.equal(result.status, "passed");
  assert.equal(result.stdout.length, 32_000);
  assert.equal(result.stderr.length, 32_000);
  assert.equal(result.outputTruncated, true);
});
