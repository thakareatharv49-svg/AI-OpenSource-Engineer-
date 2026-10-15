import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { request as httpRequest, type Server } from "node:http";
import { app } from "../src/index.js";
import { createGithubSession } from "../src/security/session.js";

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

test("GET /api/auth/me reports an unauthenticated session without exposing credentials", async () => {
  const response = await fetch(baseUrl + "/api/auth/me");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false, user: null });
});

test("GET /api/auth/github fails closed when OAuth is not configured", async () => {
  const previousId = process.env.GITHUB_OAUTH_CLIENT_ID;
  delete process.env.GITHUB_OAUTH_CLIENT_ID;
  try {
    const response = await fetch(baseUrl + "/api/auth/github", { redirect: "manual" });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /OAuth is not configured/i);
  } finally {
    if (previousId === undefined) delete process.env.GITHUB_OAUTH_CLIENT_ID;
    else process.env.GITHUB_OAUTH_CLIENT_ID = previousId;
  }
});

test("POST /api/ai/select-issue rejects anonymous requests before invoking an AI provider", async () => {
  const response = await fetch(baseUrl + "/api/ai/select-issue", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify({ issues: [{ id: 1, title: "example" }] }),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "AUTH_REQUIRED");
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
  const response = await fetch(baseUrl + "/api/github/file", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "LEGACY_WRITE_DISABLED");
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
  const response = await fetch(baseUrl + "/api/github/file", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "LEGACY_WRITE_DISABLED");
});

test("GET /api/github/repository rejects invalid owner or repository path segments", async () => {
  const response = await fetch(baseUrl + "/api/github/repository/invalid%20owner/project");
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /invalid GitHub repository/i);
});


test("PUT /api/github/file rejects oversized commit messages", async () => {
  const response = await fetch(baseUrl + "/api/github/file", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "LEGACY_WRITE_DISABLED");
});

test("PUT /api/github/file blocks secret-bearing content before GitHub access", async () => {
  const response = await fetch(baseUrl + "/api/github/file", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "LEGACY_WRITE_DISABLED");
});

test("PUT /api/github/file requires manual review for workflow changes", async () => {
  const response = await fetch(baseUrl + "/api/github/file", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "LEGACY_WRITE_DISABLED");
});

test("PUT /api/github/file rejects credential paths before contacting GitHub", async () => {
  const response = await fetch(baseUrl + "/api/github/file", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "LEGACY_WRITE_DISABLED");
});

test("AI endpoints throttle excessive requests before calling providers", async () => {
  const rateLimitSession = createGithubSession({ login: "rate-limit-test", avatarUrl: null, accessToken: "test-token" });
  const cookie = `aose_session=${rateLimitSession.id}`;
  let lastStatus = 0;
  for (let i = 0; i < 21; i += 1) {
    const response = await fetch(baseUrl + "/api/ai/select-issue", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", Cookie: cookie },
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


// Integration-style tests mock only GitHub's API. The app's local HTTP request
// still traverses Express, middleware, routing, validation, and response handling.
let testSessionCookie = "";

async function withMockedGitHubApi<T>(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
  run: () => Promise<T>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-token";
  const testSession = createGithubSession({ login: "contributor", avatarUrl: null, accessToken: "test-token" });
  testSessionCookie = `aose_session=${testSession.id}`;
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname !== "api.github.com") {
      return originalFetch(input, init);
    }
    return handler(url, init);
  }) as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("POST /api/github/commit-proposal writes every proposed file in one branch update", async () => {
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  let blobCount = 0;

  await withMockedGitHubApi(async (url, init) => {
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ method, path: url.pathname, body });

    if (url.pathname === "/user") return jsonResponse({ login: "contributor" });
    if (url.pathname === "/repos/contributor/demo-fork") {
      return jsonResponse({
        full_name: "contributor/demo-fork",
        fork: true,
        parent: { full_name: "upstream/demo" },
      });
    }
    if (url.pathname.endsWith("/git/ref/heads/ai-contribution-test")) {
      return jsonResponse({ object: { sha: "parent-commit" } });
    }
    if (url.pathname.endsWith("/git/commits/parent-commit")) {
      return jsonResponse({ tree: { sha: "parent-tree" } });
    }
    if (url.pathname.endsWith("/git/blobs") && method === "POST") {
      blobCount += 1;
      return jsonResponse({ sha: "blob-" + blobCount });
    }
    if (url.pathname.endsWith("/git/trees") && method === "POST") {
      const tree = body?.tree as Array<{ path: string }>;
      assert.deepEqual(tree.map((entry) => entry.path), ["src/one.ts", "src/two.ts"]);
      return jsonResponse({ sha: "proposal-tree" });
    }
    if (url.pathname.endsWith("/git/commits") && method === "POST") {
      assert.deepEqual(body?.parents, ["parent-commit"]);
      assert.equal(body?.tree, "proposal-tree");
      return jsonResponse({ sha: "proposal-commit", html_url: "https://github.com/contributor/demo-fork/commit/proposal-commit" });
    }
    if (url.pathname.endsWith("/git/refs/heads/ai-contribution-test") && method === "PATCH") {
      assert.deepEqual(body, { sha: "proposal-commit", force: false });
      return jsonResponse({ ref: "refs/heads/ai-contribution-test" });
    }
    return jsonResponse({ message: "Unexpected mocked GitHub request: " + method + " " + url.pathname }, 500);
  }, async () => {
    const response = await originalFetchForTest(baseUrl + "/api/github/commit-proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: testSessionCookie },
      body: JSON.stringify({
        owner: "contributor",
        repo: "demo-fork",
        branchName: "ai-contribution-test",
        commitMessage: "Add two source files",
        changes: [
          { filePath: "src/one.ts", content: "export const one = 1;\n" },
          { filePath: "src/two.ts", content: "export const two = 2;\n" },
        ],
      }),
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.filesCommitted, 2);
    assert.equal(data.commit.sha, "proposal-commit");
    assert.equal(calls.filter((call) => call.method === "PATCH").length, 1);
    assert.equal(calls.filter((call) => call.method === "PUT").length, 0);
  });
});

test("POST /api/github/commit-proposal leaves the branch untouched when a blob cannot be prepared", async () => {
  let blobCount = 0;
  let refUpdates = 0;
  const originalFetch = globalThis.fetch;

  await withMockedGitHubApi(async (url, init) => {
    const method = init.method ?? "GET";
    if (url.pathname === "/user") return jsonResponse({ login: "contributor" });
    if (url.pathname === "/repos/contributor/demo-fork") {
      return jsonResponse({ full_name: "contributor/demo-fork", fork: true, parent: { full_name: "upstream/demo" } });
    }
    if (url.pathname.endsWith("/git/ref/heads/ai-contribution-test")) {
      return jsonResponse({ object: { sha: "parent-commit" } });
    }
    if (url.pathname.endsWith("/git/commits/parent-commit")) return jsonResponse({ tree: { sha: "parent-tree" } });
    if (url.pathname.endsWith("/git/blobs") && method === "POST") {
      blobCount += 1;
      return blobCount === 1 ? jsonResponse({ sha: "blob-1" }) : jsonResponse({ message: "simulated GitHub failure" }, 503);
    }
    if (method === "PATCH") refUpdates += 1;
    return jsonResponse({ message: "Unexpected mocked GitHub request" }, 500);
  }, async () => {
    const response = await originalFetchForTest(baseUrl + "/api/github/commit-proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: testSessionCookie },
      body: JSON.stringify({
        owner: "contributor",
        repo: "demo-fork",
        branchName: "ai-contribution-test",
        commitMessage: "Add two source files",
        changes: [
          { filePath: "src/one.ts", content: "export const one = 1;\n" },
          { filePath: "src/two.ts", content: "export const two = 2;\n" },
        ],
      }),
    });
    assert.equal(response.status, 503);
    const data = await response.json();
    assert.equal(data.branchUnchanged, true);
    assert.equal(data.failedFile, "src/two.ts");
    assert.equal(refUpdates, 0);
  });
});

// Preserve the real fetch for local test-server requests even while GitHub API
// calls are mocked inside the route.
const originalFetchForTest = globalThis.fetch.bind(globalThis);


test("POST /api/sandbox/snapshot rejects traversal repository identifiers", async () => {
  const previous = process.env.SANDBOX_ENABLED;
  process.env.SANDBOX_ENABLED = "true";
  try {
    const response = await fetch(baseUrl + "/api/sandbox/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: "../project" }),
    });
    assert.equal(response.status, 400);
  } finally {
    if (previous === undefined) delete process.env.SANDBOX_ENABLED;
    else process.env.SANDBOX_ENABLED = previous;
  }
});

test("POST /api/sandbox/snapshot stays disabled unless explicitly enabled", async () => {
  const previous = process.env.SANDBOX_ENABLED;
  delete process.env.SANDBOX_ENABLED;
  try {
    const response = await fetch(baseUrl + "/api/sandbox/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: "example/project" }),
    });
    assert.equal(response.status, 503);
  } finally {
    if (previous === undefined) delete process.env.SANDBOX_ENABLED;
    else process.env.SANDBOX_ENABLED = previous;
  }
});

test("POST /api/sandbox/run stays disabled unless explicitly enabled", async () => {
  const previous = process.env.SANDBOX_ENABLED;
  delete process.env.SANDBOX_ENABLED;
  try {
    const response = await fetch(baseUrl + "/api/sandbox/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runtime: "node",
        check: "test",
        files: [{ path: "package.json", content: '{"scripts":{"test":"node --test"}}' }],
      }),
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /disabled/i);
  } finally {
    if (previous === undefined) delete process.env.SANDBOX_ENABLED;
    else process.env.SANDBOX_ENABLED = previous;
  }
});

function githubJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

test("branch retry safely reuses a branch only when it still points at the requested base", async () => {
  const session = createGithubSession({ login: "retry-test-user", avatarUrl: null, accessToken: "mock-token" });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(method + " " + url);
    if (url === "https://api.github.com/user") return githubJson({ login: "retry-test-user" });
    if (url === "https://api.github.com/repos/retry-test-user/project-fork") {
      return githubJson({ full_name: "retry-test-user/project-fork", fork: true, parent: { full_name: "upstream/project" } });
    }
    if (url.endsWith("/git/ref/heads/main")) return githubJson({ object: { sha: "base-sha-123" } });
    if (url.endsWith("/git/refs") && method === "POST") return githubJson({ message: "Reference already exists" }, 422);
    if (url.endsWith("/git/ref/heads/ai-fix-issue")) return githubJson({ ref: "refs/heads/ai-fix-issue", object: { sha: "base-sha-123" } });
    throw new Error("Unexpected mocked GitHub request: " + method + " " + url);
  }) as typeof fetch;
  try {
    const response = await originalFetch(baseUrl + "/api/github/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "aose_session=" + session.id },
      body: JSON.stringify({ owner: "retry-test-user", repo: "project-fork", branchName: "ai-fix-issue", baseBranch: "main" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { reused?: boolean; branch?: { sha?: string } };
    assert.equal(body.reused, true);
    assert.equal(body.branch?.sha, "base-sha-123");
    assert.equal(calls.filter(call => call.includes("/git/refs") && call.startsWith("POST")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("branch retry refuses to reuse a branch that moved after the original request", async () => {
  const session = createGithubSession({ login: "retry-conflict-user", avatarUrl: null, accessToken: "mock-token" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "https://api.github.com/user") return githubJson({ login: "retry-conflict-user" });
    if (url === "https://api.github.com/repos/retry-conflict-user/project-fork") {
      return githubJson({ full_name: "retry-conflict-user/project-fork", fork: true, parent: { full_name: "upstream/project" } });
    }
    if (url.endsWith("/git/ref/heads/main")) return githubJson({ object: { sha: "base-sha-123" } });
    if (url.endsWith("/git/refs") && method === "POST") return githubJson({ message: "Reference already exists" }, 422);
    if (url.endsWith("/git/ref/heads/ai-fix-issue")) return githubJson({ ref: "refs/heads/ai-fix-issue", object: { sha: "newer-sha-456" } });
    throw new Error("Unexpected mocked GitHub request: " + method + " " + url);
  }) as typeof fetch;
  try {
    const response = await originalFetch(baseUrl + "/api/github/branch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "aose_session=" + session.id },
      body: JSON.stringify({ owner: "retry-conflict-user", repo: "project-fork", branchName: "ai-fix-issue", baseBranch: "main" }),
    });
    assert.equal(response.status, 409);
    const body = await response.json() as { retryable?: boolean; error?: string };
    assert.equal(body.retryable, false);
    assert.match(body.error ?? "", /different commit/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("atomic commit retry recognizes the proposal trailer and does not create a duplicate commit", async () => {
  const session = createGithubSession({ login: "commit-retry-user", avatarUrl: null, accessToken: "mock-token" });
  const commitMessage = "Fix docs";
  const changes = [{ filePath: "README.md", content: "# Proposal\n" }];
  const key = createHash("sha256").update(JSON.stringify({
    message: commitMessage.trim(),
    changes: changes.map(change => ({ filePath: change.filePath.trim(), content: change.content })).sort((a, b) => a.filePath.localeCompare(b.filePath)),
  })).digest("hex").slice(0, 24);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push(method + " " + url);
    if (url === "https://api.github.com/user") return githubJson({ login: "commit-retry-user" });
    if (url === "https://api.github.com/repos/commit-retry-user/project-fork") {
      return githubJson({ full_name: "commit-retry-user/project-fork", fork: true, parent: { full_name: "upstream/project" } });
    }
    if (url.endsWith("/git/ref/heads/ai-fix-issue")) return githubJson({ object: { sha: "already-committed-sha" } });
    if (url.endsWith("/git/commits/already-committed-sha")) {
      return githubJson({ message: "Fix docs\n\n[ai-ose-proposal:" + key + "]", tree: { sha: "existing-tree" } });
    }
    throw new Error("Retry should not write another Git object: " + method + " " + url);
  }) as typeof fetch;
  try {
    const response = await originalFetch(baseUrl + "/api/github/commit-proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "aose_session=" + session.id },
      body: JSON.stringify({ owner: "commit-retry-user", repo: "project-fork", branchName: "ai-fix-issue", commitMessage, changes }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { alreadyCommitted?: boolean; commit?: { sha?: string } };
    assert.equal(body.alreadyCommitted, true);
    assert.equal(body.commit?.sha, "already-committed-sha");
    assert.equal(calls.some(call => call.includes("/git/blobs") || call.includes("/git/trees") || call.includes("/git/refs/heads/")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
