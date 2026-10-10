import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { request as httpRequest, type Server } from "node:http";
import { app } from "../src/index.js";

let server: Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not bind to a TCP port"));
        return;
      }
      baseUrl = "http://127.0.0.1:" + address.port;
      resolve();
    });
    server.once("error", reject);
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("GET / returns the service banner", async () => {
  const response = await fetch(baseUrl + "/");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: "AI Open Source Engineer server is running",
  });
});

test("GET /api/health returns an OK health status", async () => {
  const response = await fetch(baseUrl + "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});


test("POST /api/github/fork rejects missing repository input", async () => {
  const response = await fetch(baseUrl + "/api/github/fork", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: "", repo: "" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /owner and repository/i);
});

test("POST /api/github/fork rejects dot-segment repository identifiers", async () => {
  const response = await fetch(baseUrl + "/api/github/fork", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: "..", repo: "project" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /invalid GitHub repository/i);
});

test("POST /api/github/branch rejects incomplete branch input", async () => {
  const response = await fetch(baseUrl + "/api/github/branch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: "example", repo: "project" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /branch name.*base branch/i);
});

test("PUT /api/github/file rejects incomplete file changes", async () => {
  const response = await fetch(baseUrl + "/api/github/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: "example", repo: "project" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /file path.*content/i);
});

test("POST /api/github/pull-request rejects missing head repository", async () => {
  const response = await fetch(baseUrl + "/api/github/pull-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "upstream",
      repo: "project",
      title: "Fix issue",
      headBranch: "my-account:fix-issue",
      baseBranch: "main",
    }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /head branch/i);
});

test("POST /api/github/pull-request rejects incomplete pull request input", async () => {
  const response = await fetch(baseUrl + "/api/github/pull-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: "example", repo: "project" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /title.*head branch.*base branch/i);
});


test("POST /api/github/branch rejects malformed Git refs before contacting GitHub", async () => {
  const response = await fetch(baseUrl + "/api/github/branch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "example",
      repo: "project",
      branchName: "../unsafe",
      baseBranch: "main",
    }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid Git refs/i);
});

test("PUT /api/github/file rejects traversal paths before contacting GitHub", async () => {
  const response = await fetch(baseUrl + "/api/github/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "example",
      repo: "project",
      branchName: "ai-contribution-test",
      filePath: "../README.md",
      content: "# unsafe",
      commitMessage: "test",
    }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /safe repository-relative path/i);
});

test("GET /api/github/repository rejects invalid owner or repository path segments", async () => {
  const response = await fetch(baseUrl + "/api/github/repository/invalid%20owner/project");
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /invalid GitHub repository/i);
});


test("PUT /api/github/file rejects oversized commit messages", async () => {
  const response = await fetch(baseUrl + "/api/github/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "example",
      repo: "project",
      branchName: "ai-contribution-test",
      filePath: "README.md",
      content: "# safe",
      commitMessage: "x".repeat(201),
    }),
  });
  assert.equal(response.status, 400);
});

test("PUT /api/github/file blocks secret-bearing content before GitHub access", async () => {
  const response = await fetch(baseUrl + "/api/github/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "example",
      repo: "project",
      branchName: "ai-contribution-test",
      filePath: "src/config.ts",
      content: 'const token = "ghp_123456789012345678901234567890123456";',
      commitMessage: "test",
    }),
  });
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /safety gate/i);
});

test("PUT /api/github/file requires manual review for workflow changes", async () => {
  const response = await fetch(baseUrl + "/api/github/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "example",
      repo: "project",
      branchName: "ai-contribution-test",
      filePath: ".github/workflows/ci.yml",
      content: "name: custom workflow\n",
      commitMessage: "test",
    }),
  });
  assert.equal(response.status, 422);
});

test("PUT /api/github/file rejects credential paths before contacting GitHub", async () => {
  const response = await fetch(baseUrl + "/api/github/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: "example",
      repo: "project",
      branchName: "ai-contribution-test",
      filePath: ".npmrc",
      content: "//registry.npmjs.org/:_authToken=secret",
      commitMessage: "test",
    }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /safe repository-relative path/i);
});

test("AI endpoints throttle excessive requests before calling providers", async () => {
  let lastStatus = 0;
  for (let i = 0; i < 21; i += 1) {
    const response = await fetch(baseUrl + "/api/ai/select-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issues: [] }),
    });
    lastStatus = response.status;
    if (i < 20) assert.equal(response.status, 400);
  }
  assert.equal(lastStatus, 429);
});



test("loopback API rejects foreign Host headers", async () => {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: "/",
        method: "GET",
        headers: { Host: "attacker.example" },
      },
      (incoming) => {
        let body = "";
        incoming.setEncoding("utf8");
        incoming.on("data", (chunk: string) => { body += chunk; });
        incoming.on("end", () => resolve({ statusCode: incoming.statusCode ?? 0, body }));
      }
    );
    request.on("error", reject);
    request.end();
  });
  assert.equal(response.statusCode, 421);
  assert.deepEqual(JSON.parse(response.body), { error: "Invalid Host header" });
});


test("POST /api/github/safety-check allows a clean concrete proposal", async () => {
  const response = await fetch(baseUrl + "/api/github/safety-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      changes: [{ filePath: "src/math.ts", content: "export const add = (a: number, b: number) => a + b;\n" }],
    }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.safetyReport.safeToCommit, true);
  assert.deepEqual(data.safetyReport.findings, []);
});

test("POST /api/github/safety-check blocks secret-bearing proposals", async () => {
  const response = await fetch(baseUrl + "/api/github/safety-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      changes: [{ filePath: "src/config.ts", content: 'const token = "ghp_123456789012345678901234567890123456";' }],
    }),
  });
  assert.equal(response.status, 422);
  const data = await response.json();
  assert.equal(data.safetyReport.safeToCommit, false);
  assert.ok(data.safetyReport.findings.some((finding: { severity: string }) => finding.severity === "block"));
});

test("POST /api/github/safety-check requires manual review for workflow changes", async () => {
  const response = await fetch(baseUrl + "/api/github/safety-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      changes: [{ filePath: ".github/workflows/ci.yml", content: "name: custom workflow\n" }],
    }),
  });
  assert.equal(response.status, 422);
  const data = await response.json();
  assert.ok(data.safetyReport.findings.some((finding: { severity: string }) => finding.severity === "review"));
});
