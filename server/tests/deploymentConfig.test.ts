import assert from "node:assert/strict";
import { test } from "node:test";
import { validateDeploymentConfiguration } from "../src/security/deploymentConfig.js";

const safeProduction = {
  NODE_ENV: "production",
  GITHUB_OAUTH_CLIENT_ID: "client-id",
  GITHUB_OAUTH_CLIENT_SECRET: "client-secret",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  API_PUBLIC_URL: "https://api.example.com",
  GITHUB_OAUTH_CALLBACK_URL: "https://api.example.com/api/auth/github/callback",
  CLIENT_ORIGINS: "https://app.example.com,https://admin.example.com",
  SANDBOX_ENABLED: "false",
};

test("allows complete production configuration with HTTPS and explicit sandbox disablement", () => {
  assert.deepEqual(validateDeploymentConfiguration(safeProduction), []);
});

test("rejects missing shared infrastructure and OAuth configuration", () => {
  const errors = validateDeploymentConfiguration({ NODE_ENV: "production" });
  assert.ok(errors.some((error) => error.includes("UPSTASH_REDIS_REST_TOKEN")));
  assert.ok(errors.some((error) => error.includes("GITHUB_OAUTH_CLIENT_SECRET")));
  assert.ok(errors.some((error) => error.includes("CLIENT_ORIGINS")));
});

test("rejects insecure URLs, non-origin CORS values, and production sandbox enablement", () => {
  const errors = validateDeploymentConfiguration({
    ...safeProduction,
    API_PUBLIC_URL: "http://api.example.com",
    GITHUB_OAUTH_CALLBACK_URL: "http://api.example.com/api/auth/github/callback",
    CLIENT_ORIGINS: "https://app.example.com/path,http://localhost:5173",
    UPSTASH_REDIS_REST_URL: "http://example.upstash.io",
    SANDBOX_ENABLED: "true",
  });
  assert.ok(errors.some((error) => error.includes("API_PUBLIC_URL")));
  assert.ok(errors.some((error) => error.includes("GITHUB_OAUTH_CALLBACK_URL")));
  assert.ok(errors.some((error) => error.includes("CLIENT_ORIGINS")));
  assert.ok(errors.some((error) => error.includes("UPSTASH_REDIS_REST_URL")));
  assert.ok(errors.some((error) => error.includes("SANDBOX_ENABLED")));
});

test("keeps local development configuration backward-compatible", () => {
  assert.deepEqual(validateDeploymentConfiguration({ NODE_ENV: "development" }), []);
});
