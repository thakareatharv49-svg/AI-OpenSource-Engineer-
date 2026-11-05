import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import githubRouter from "../src/routes/github.js";

let server: Server;
let baseUrl = "";
const originalFetch = globalThis.fetch;
const requestApp = (input: RequestInfo | URL, init?: RequestInit) => originalFetch(input, init);

before(async () => {
  const app = express();
  app.use((req, res, next) => {
    const token = req.header("x-test-github-token");
    if (token) res.locals.githubSession = { login: "test-user", accessToken: token };
    next();
  });
  app.use("/api/github", githubRouter);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Test server did not bind"));
      baseUrl = "http://127.0.0.1:" + address.port;
      resolve();
    });
    server.once("error", reject);
  });
});

after(async () => {
  globalThis.fetch = originalFetch;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("repository search requires the signed-in user's GitHub session", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error("GitHub must not be called for anonymous search");
  }) as typeof fetch;
  const response = await requestApp(baseUrl + "/api/github/repositories?q=typescript");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Sign in with GitHub to search repositories.",
    code: "AUTH_REQUIRED",
  });
  assert.equal(providerCalls, 0);
});

test("repository search validates query and pagination before calling GitHub", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error("GitHub must not be called for invalid search input");
  }) as typeof fetch;
  const headers = { "x-test-github-token": "user-specific-token" };
  for (const path of [
    "/api/github/repositories?q=ab",
    "/api/github/repositories?q=" + "x".repeat(201),
    "/api/github/repositories?q=typescript&sort=unknown",
    "/api/github/repositories?q=typescript&order=sideways",
    "/api/github/repositories?q=typescript&page=101",
    "/api/github/repositories?q=typescript&per_page=31",
  ]) {
    const response = await requestApp(baseUrl + path, { headers });
    assert.equal(response.status, 400, path);
  }
  assert.equal(providerCalls, 0);
});

test("repository search uses the caller's token and returns normalized non-archived upstream projects", async () => {
  let requestedUrl: URL | undefined;
  let authorization = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    requestedUrl = new URL(String(input));
    authorization = new Headers(init.headers).get("authorization") ?? "";
    return new Response(JSON.stringify({
      total_count: 4,
      incomplete_results: false,
      items: [
        { id: 1, full_name: "acme/typed-tools", name: "typed-tools", description: "TypeScript utilities", html_url: "https://github.com/acme/typed-tools", default_branch: "main", language: "TypeScript", stargazers_count: 1200, forks_count: 80, open_issues_count: 14, updated_at: "2026-11-01T00:00:00Z", pushed_at: "2026-11-02T00:00:00Z", topics: ["typescript", "tooling"], archived: false, disabled: false, fork: false, license: { spdx_id: "MIT", name: "MIT License" } },
        { id: 2, full_name: "acme/archived", html_url: "https://github.com/acme/archived", archived: true, fork: false, disabled: false },
        { id: 3, full_name: "acme/fork", html_url: "https://github.com/acme/fork", archived: false, fork: true, disabled: false },
        { id: 4, full_name: "acme/disabled", html_url: "https://github.com/acme/disabled", archived: false, fork: false, disabled: true },
      ],
    }), { status: 200 });
  }) as typeof fetch;

  const response = await requestApp(
    baseUrl + "/api/github/repositories?q=language%3ATypeScript%20agent&sort=updated&order=asc&page=2&per_page=10",
    { headers: { "x-test-github-token": "token-for-alice" } },
  );
  assert.equal(response.status, 200);
  assert.equal(authorization, "Bearer token-for-alice");
  assert.equal(requestedUrl?.origin, "https://api.github.com");
  assert.equal(requestedUrl?.pathname, "/search/repositories");
  assert.equal(requestedUrl?.searchParams.get("q"), "language:TypeScript agent archived:false fork:false");
  assert.equal(requestedUrl?.searchParams.get("sort"), "updated");
  assert.equal(requestedUrl?.searchParams.get("order"), "asc");
  assert.equal(requestedUrl?.searchParams.get("page"), "2");
  assert.equal(requestedUrl?.searchParams.get("per_page"), "10");

  const body = await response.json() as {
    totalCount: number; incompleteResults: boolean; page: number; perPage: number;
    repositories: Array<{ fullName: string; stars: number; topics: string[]; license: { spdxId: string } | null }>;
  };
  assert.equal(body.totalCount, 4);
  assert.equal(body.incompleteResults, false);
  assert.equal(body.page, 2);
  assert.equal(body.perPage, 10);
  assert.equal(body.repositories.length, 1);
  assert.equal(body.repositories[0]?.fullName, "acme/typed-tools");
  assert.equal(body.repositories[0]?.stars, 1200);
  assert.deepEqual(body.repositories[0]?.topics, ["typescript", "tooling"]);
  assert.equal(body.repositories[0]?.license?.spdxId, "MIT");
});

test("repository search maps GitHub rate limits and provider failures to safe API responses", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "API rate limit exceeded" }), { status: 403 })) as typeof fetch;
  const response = await requestApp(baseUrl + "/api/github/repositories?q=typescript", {
    headers: { "x-test-github-token": "token-for-bob" },
  });
  assert.equal(response.status, 403);
  const body = await response.json() as { code: string };
  assert.equal(body.code, "GITHUB_RATE_LIMITED_OR_FORBIDDEN");
});
