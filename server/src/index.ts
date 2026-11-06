import githubRouter from "./routes/github.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import aiRouter from "./routes/ai.js";
import sandboxRouter from "./routes/sandbox.js";
import authRouter from "./routes/auth.js";
import lifecycleRouter from "./routes/lifecycle.js";
import { attachGithubSession, requireGithubSession, requireTrustedOrigin } from "./security/session.js";
import { consumeDistributedQuota, persistOperationalEvent, sharedRedisConfigured } from "./security/sharedRedis.js";
import { validateDeploymentConfiguration } from "./security/deploymentConfig.js";
import { normalizeDiscoveredIssues, parseIssueDiscoveryOptions, buildIssueSearchQuery } from "./security/issueDiscovery.js";

dotenv.config();

const deploymentErrors = validateDeploymentConfiguration(process.env);
if (deploymentErrors.length) throw new Error("Invalid production configuration:\n- " + deploymentErrors.join("\n- "));

const app = express();
const PORT = Number(process.env.PORT ?? 5000);
const HOST = process.env.HOST ?? "127.0.0.1";
const allowedOrigins = (
  process.env.CLIENT_ORIGINS ??
  "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// When bound to loopback, reject foreign Host headers to reduce DNS-rebinding
// risk. Explicit non-loopback deployments remain the operator's responsibility.
const normalizedBindHost = (HOST.startsWith("[") && HOST.endsWith("]") ? HOST.slice(1, -1) : HOST).toLowerCase();
const isLoopbackBind = ["127.0.0.1", "localhost", "::1"].includes(normalizedBindHost);
if (!isLoopbackBind) {
  throw new Error("Refusing non-loopback bind: shared-store integration and production security verification are not yet approved. Keep HOST on loopback until live validation and deployment review are complete.");
}
if (["127.0.0.1", "localhost", "::1"].includes(normalizedBindHost)) {
  app.use((req, res, next) => {
    const requestHost = (req.get("host") ?? "").toLowerCase();
    const requestHostname = requestHost.startsWith("[")
      ? requestHost.slice(1, requestHost.indexOf("]"))
      : requestHost.split(":")[0];
    if (!["127.0.0.1", "localhost", "::1"].includes(requestHostname)) {
      return res.status(421).json({ error: "Invalid Host header" });
    }
    next();
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof Error && error.message === "Origin is not allowed by CORS") {
    res.status(403).json({ error: "Request origin is not allowed.", code: "ORIGIN_NOT_ALLOWED" });
    return;
  }
  next(error);
});

app.use(express.json({ limit: "1mb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  next();
});

const aiRequestBuckets = new Map<string, { count: number; resetAt: number }>();
const AI_RATE_LIMIT_WINDOW_MS = readBoundedInteger("AI_RATE_LIMIT_WINDOW_MS", 10 * 60 * 1000, 10_000, 24 * 60 * 60 * 1000);
const AI_RATE_LIMIT_MAX = readBoundedInteger("AI_RATE_LIMIT_MAX", 20, 1, 1000);
const AI_DAILY_QUOTA = readBoundedInteger("AI_DAILY_QUOTA", Math.max(200, AI_RATE_LIMIT_MAX), AI_RATE_LIMIT_MAX, 100_000);
function readBoundedInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}

async function consumeQuota(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; count: number; resetMs: number }> {
  if (sharedRedisConfigured()) {
    const result = await consumeDistributedQuota(key, windowMs);
    return { allowed: result.count <= limit, count: result.count, resetMs: result.resetMs };
  }
  const now = Date.now();
  for (const [existingKey, bucket] of aiRequestBuckets) if (bucket.resetAt <= now) aiRequestBuckets.delete(existingKey);
  let bucket = aiRequestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (aiRequestBuckets.size >= 10_000) return { allowed: false, count: limit + 1, resetMs: 60_000 };
    bucket = { count: 0, resetAt: now + windowMs };
    aiRequestBuckets.set(key, bucket);
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, count: bucket.count, resetMs: Math.max(0, bucket.resetAt - now) };
}

function recordAiRequestMetrics(req: express.Request, res: express.Response, next: express.NextFunction) {
  const startedAt = Date.now();
  res.on("finish", () => {
    const session = res.locals.githubSession as { login?: string } | null;
    const event = { event: "ai.request", at: new Date().toISOString(), user: session?.login ?? "anonymous", route: req.path, method: req.method, status: res.statusCode, durationMs: Date.now() - startedAt };
    console.log(JSON.stringify(event));
    void persistOperationalEvent(event).catch(() => undefined);
  });
  next();
}

function auditSensitiveRequest(req: express.Request, res: express.Response, next: express.NextFunction) {
  const startedAt = Date.now();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    res.on("finish", () => {
      const session = res.locals.githubSession as { login?: string } | null;
      const event = { event: "security.audit", at: new Date().toISOString(), user: session?.login ?? "anonymous", method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt };
      console.log(JSON.stringify(event));
      void persistOperationalEvent(event).catch(() => undefined);
    });
  }
  next();
}

app.use("/api/ai", attachGithubSession, recordAiRequestMetrics);
app.use("/api/ai", async (req, res, next) => {
  const session = res.locals.githubSession as { login?: string } | null;
  const identity = session?.login ? `user:${session.login.toLowerCase()}` : `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
  try {
    const burst = await consumeQuota(`aose:quota:burst:${identity}`, AI_RATE_LIMIT_MAX, AI_RATE_LIMIT_WINDOW_MS);
    const daily = burst.allowed && session?.login ? await consumeQuota(`aose:quota:daily:${session.login.toLowerCase()}`, AI_DAILY_QUOTA, 24 * 60 * 60 * 1000) : null;
    const isDaily = burst.allowed && Boolean(daily && !daily.allowed);
    const limited = !burst.allowed ? burst : daily && !daily.allowed ? daily : null;
    const limit = isDaily ? AI_DAILY_QUOTA : AI_RATE_LIMIT_MAX;
    const resetMs = limited?.resetMs ?? burst.resetMs;
    res.setHeader("RateLimit-Policy", `${AI_RATE_LIMIT_MAX};w=${Math.ceil(AI_RATE_LIMIT_WINDOW_MS / 1000)}`);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - (limited?.count ?? burst.count))));
    res.setHeader("RateLimit-Reset", String(Math.ceil(resetMs / 1000)));
    if (limited) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(resetMs / 1000))));
      return res.status(429).json({ error: isDaily ? "Daily AI request quota reached. Please try again later." : "AI request limit reached. Please wait before trying again.", code: isDaily ? "AI_DAILY_QUOTA_EXCEEDED" : "AI_RATE_LIMITED" });
    }
    next();
  } catch {
    return res.status(503).json({ error: "Rate-limit store is unavailable; AI requests are paused to prevent quota bypass.", code: "RATE_LIMIT_STORE_UNAVAILABLE" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/lifecycle", attachGithubSession, requireTrustedOrigin, lifecycleRouter);
app.use("/api/ai", requireTrustedOrigin, requireGithubSession, aiRouter);
app.use("/api/sandbox", attachGithubSession, auditSensitiveRequest, sandboxRouter);
app.use("/api/github", attachGithubSession, auditSensitiveRequest, githubRouter);

app.get("/", (_req, res) => {
  res.json({
    message: "AI Open Source Engineer server is running",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

// GitHub issue discovery. A signed-in user's token raises GitHub's search quota;
 // public discovery remains available without a session.
app.get("/api/github/issues", async (req, res) => {
  const options = parseIssueDiscoveryOptions(req.query as Record<string, unknown>);
  if (!options) {
    return res.status(400).json({
      error: "Invalid issue search filters. Check query, repository, labels, sort, order, page, per_page, and stale_days.",
      code: "INVALID_ISSUE_SEARCH_OPTIONS",
    });
  }

  try {
    const searchQuery = buildIssueSearchQuery(options);
    const url = new URL("https://api.github.com/search/issues");
    url.searchParams.set("q", searchQuery);
    url.searchParams.set("sort", options.sort);
    url.searchParams.set("order", options.order);
    url.searchParams.set("page", String(options.page));
    url.searchParams.set("per_page", String(options.perPage));

    const token = (res.locals.githubSession as { accessToken?: string } | null)?.accessToken;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AI-OpenSource-Engineer",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    const data = await response.json() as {
      total_count?: unknown;
      incomplete_results?: unknown;
      items?: unknown;
      message?: unknown;
    };
    if (!response.ok) {
      const status = response.status === 403 || response.status === 429 ? 429 : 502;
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) res.setHeader("Retry-After", retryAfter);
      return res.status(status).json({
        error: typeof data.message === "string" ? data.message : "GitHub issue search failed.",
        code: status === 429 ? "GITHUB_RATE_LIMITED" : "GITHUB_ISSUE_SEARCH_FAILED",
      });
    }
    if (!Array.isArray(data.items)) {
      return res.status(502).json({ error: "GitHub returned an invalid issue-search response.", code: "GITHUB_ISSUE_RESPONSE_INVALID" });
    }

    const normalized = normalizeDiscoveredIssues(data.items, options.staleDays);
    return res.json({
      query: searchQuery,
      page: options.page,
      perPage: options.perPage,
      totalCount: typeof data.total_count === "number" ? data.total_count : null,
      incompleteResults: data.incomplete_results === true,
      count: normalized.issues.length,
      issues: normalized.issues,
      excluded: normalized.excluded,
      filters: { repository: options.repository || null, labels: options.labels, staleDays: options.staleDays },
    });
  } catch (error) {
    console.error("GitHub issue discovery error:", error);
    return res.status(502).json({
      error: error instanceof Error ? error.message : "GitHub issue search is temporarily unavailable.",
      code: "GITHUB_ISSUE_SEARCH_UNAVAILABLE",
    });
  }
});

export { app };

// Avoid opening a network listener when the app is imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, HOST, () => {
    console.log("Server running on http://localhost:" + PORT);
  });
}