import assert from "node:assert/strict";
import { after, before, afterEach, test } from "node:test";
import type { Server } from "node:http";
import { app } from "../src/index.js";

let server: Server;
let baseUrl = "";
const envKeys = [
  "GITHUB_OAUTH_CLIENT_ID",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "GITHUB_OAUTH_CALLBACK_URL",
  "API_PUBLIC_URL",
  "CLIENT_ORIGINS",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const requestApp = (input: RequestInfo | URL, init?: RequestInit) => originalFetch(input, init);

before(async () => {
  for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[key];
  process.env.GITHUB_OAUTH_CLIENT_ID = "oauth-client-id";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = "oauth-client-secret";
  process.env.GITHUB_OAUTH_CALLBACK_URL = "http://localhost:5000/api/auth/github/callback";
  process.env.API_PUBLIC_URL = "http://localhost:5000";
  process.env.CLIENT_ORIGINS = "http://localhost:5173";
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
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function cookieFrom(header: string | null, name: string): string {
  assert.ok(header, "expected Set-Cookie response header");
  const match = header.match(new RegExp("(?:^|[,;]\\s*)" + name + "=([^;,]+)"));
  assert.ok(match, "expected " + name + " cookie");
  return name + "=" + match[1];
}

test("OAuth initiation uses configured callback, minimal scopes and a random state cookie", async () => {
  const response = await requestApp(baseUrl + "/api/auth/github", { redirect: "manual" });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.origin + location.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), "oauth-client-id");
  assert.equal(location.searchParams.get("redirect_uri"), "http://localhost:5000/api/auth/github/callback");
  assert.equal(location.searchParams.get("scope"), "public_repo read:user");
  const state = location.searchParams.get("state") ?? "";
  assert.ok(state.length >= 40);
  assert.equal(cookieFrom(response.headers.get("set-cookie"), "aose_oauth_state").split("=")[1], state);
});

test("OAuth callback exchanges the code, stores identity server-side and never returns the access token", async () => {
  let tokenExchangeBody: Record<string, unknown> | undefined;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://github.com/login/oauth/access_token") {
      tokenExchangeBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ access_token: "server-only-access-token", token_type: "bearer" }), { status: 200 });
    }
    if (url === "https://api.github.com/user") {
      assert.match(new Headers(init.headers).get("authorization") ?? "", /server-only-access-token/);
      return new Response(JSON.stringify({ id: 321, login: "oauth-test-user", avatar_url: "https://avatars.example/user.png" }), { status: 200 });
    }
    throw new Error("Unexpected external request: " + url);
  }) as typeof fetch;

  const start = await requestApp(baseUrl + "/api/auth/github", { redirect: "manual" });
  const authorizeUrl = new URL(start.headers.get("location") ?? "");
  const state = authorizeUrl.searchParams.get("state") ?? "";
  const stateCookie = cookieFrom(start.headers.get("set-cookie"), "aose_oauth_state");
  const callback = await requestApp(baseUrl + "/api/auth/github/callback?code=one-time-code&state=" + encodeURIComponent(state), {
    redirect: "manual",
    headers: { Cookie: stateCookie },
  });

  assert.equal(callback.status, 302);
  assert.equal(new URL(callback.headers.get("location") ?? "").searchParams.get("auth"), "success");
  assert.equal(tokenExchangeBody?.client_id, "oauth-client-id");
  assert.equal(tokenExchangeBody?.client_secret, "oauth-client-secret");
  assert.equal(tokenExchangeBody?.code, "one-time-code");
  assert.deepEqual(calls, ["https://github.com/login/oauth/access_token", "https://api.github.com/user"]);

  const sessionCookie = cookieFrom(callback.headers.get("set-cookie"), "aose_session");
  const me = await requestApp(baseUrl + "/api/auth/me", { headers: { Cookie: sessionCookie } });
  const body = await me.json() as { authenticated: boolean; user: { login: string }; expiresAt: string };
  assert.equal(me.status, 200);
  assert.equal(body.authenticated, true);
  assert.equal(body.user.login, "oauth-test-user");
  assert.ok(Date.parse(body.expiresAt) > Date.now());
  assert.equal(JSON.stringify(body).includes("server-only-access-token"), false);

  const logout = await requestApp(baseUrl + "/api/auth/logout", {
    method: "POST",
    headers: { Cookie: sessionCookie, Origin: "http://localhost:5173" },
  });
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { success: true });
  const afterLogout = await requestApp(baseUrl + "/api/auth/me", { headers: { Cookie: sessionCookie } });
  assert.deepEqual(await afterLogout.json(), { authenticated: false, user: null });
});

test("OAuth callback rejects a state mismatch without contacting GitHub", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error("Provider must not be contacted for invalid state");
  }) as typeof fetch;
  const response = await requestApp(baseUrl + "/api/auth/github/callback?code=one-time-code&state=wrong-state", {
    redirect: "manual",
    headers: { Cookie: "aose_oauth_state=another-state" },
  });
  assert.equal(response.status, 302);
  assert.equal(new URL(response.headers.get("location") ?? "").searchParams.get("auth"), "failed");
  assert.equal(providerCalls, 0);
});

test("OAuth callback rejects missing and oversized codes before token exchange", async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error("Provider must not be contacted for invalid code");
  }) as typeof fetch;

  const start = await requestApp(baseUrl + "/api/auth/github", { redirect: "manual" });
  const state = new URL(start.headers.get("location") ?? "").searchParams.get("state") ?? "";
  const stateCookie = cookieFrom(start.headers.get("set-cookie"), "aose_oauth_state");
  const missing = await requestApp(baseUrl + "/api/auth/github/callback?state=" + encodeURIComponent(state), {
    redirect: "manual", headers: { Cookie: stateCookie },
  });
  assert.equal(new URL(missing.headers.get("location") ?? "").searchParams.get("auth"), "failed");

  const secondStart = await requestApp(baseUrl + "/api/auth/github", { redirect: "manual" });
  const secondState = new URL(secondStart.headers.get("location") ?? "").searchParams.get("state") ?? "";
  const secondCookie = cookieFrom(secondStart.headers.get("set-cookie"), "aose_oauth_state");
  const oversized = await requestApp(baseUrl + "/api/auth/github/callback?code=" + "x".repeat(513) + "&state=" + encodeURIComponent(secondState), {
    redirect: "manual", headers: { Cookie: secondCookie },
  });
  assert.equal(new URL(oversized.headers.get("location") ?? "").searchParams.get("auth"), "failed");
  assert.equal(providerCalls, 0);
});
