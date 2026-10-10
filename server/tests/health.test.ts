import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
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
  const response = await fetch(baseUrl + "/", {
    headers: { Host: "attacker.example" },
  });
  assert.equal(response.status, 421);
  assert.deepEqual(await response.json(), { error: "Invalid Host header" });
});
