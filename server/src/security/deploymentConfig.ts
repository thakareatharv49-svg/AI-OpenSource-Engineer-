export type DeploymentEnvironment = Record<string, string | undefined>;

export function validateDeploymentConfiguration(env: DeploymentEnvironment): string[] {
  if ((env.NODE_ENV ?? "development") !== "production") return [];
  const errors: string[] = [];
  if (!env.GITHUB_OAUTH_CLIENT_ID?.trim()) errors.push("GITHUB_OAUTH_CLIENT_ID is required in production.");
  if (!env.GITHUB_OAUTH_CLIENT_SECRET?.trim()) errors.push("GITHUB_OAUTH_CLIENT_SECRET is required in production.");
  if (!env.UPSTASH_REDIS_REST_TOKEN?.trim()) errors.push("UPSTASH_REDIS_REST_TOKEN is required in production.");
  const redisUrl = parseUrl(env.UPSTASH_REDIS_REST_URL);
  if (!redisUrl || redisUrl.protocol !== "https:") errors.push("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL in production.");
  const apiUrl = parseUrl(env.API_PUBLIC_URL);
  if (!apiUrl || apiUrl.protocol !== "https:" || apiUrl.pathname !== "/" || apiUrl.search || apiUrl.hash) {
    errors.push("API_PUBLIC_URL must be an HTTPS origin in production.");
  }
  const callback = parseUrl(env.GITHUB_OAUTH_CALLBACK_URL);
  if (!callback || callback.protocol !== "https:" || !callback.pathname.endsWith("/api/auth/github/callback") || callback.search || callback.hash) {
    errors.push("GITHUB_OAUTH_CALLBACK_URL must be an HTTPS OAuth callback URL in production.");
  }
  const origins = (env.CLIENT_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => {
    const parsed = parseUrl(origin);
    return !parsed || parsed.protocol !== "https:" || parsed.origin !== origin || parsed.pathname !== "/" || parsed.search || parsed.hash;
  })) errors.push("CLIENT_ORIGINS must contain only comma-separated HTTPS origins in production.");
  if (env.SANDBOX_ENABLED?.toLowerCase() === "true") errors.push("SANDBOX_ENABLED must remain false in production until the public execution boundary is separately approved.");
  return errors;
}

function parseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try { return new URL(value); } catch { return null; }
}
