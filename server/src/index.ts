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

// GitHub issues
app.get("/api/github/issues", async (_req, res) => {
  try {
    const response = await fetch(
      "https://api.github.com/search/issues?q=" +
        encodeURIComponent(
          'is:issue is:open (label:"good first issue" OR label:good-first-issue)'
        ) +
        "&sort=updated&order=desc&per_page=30",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "AI-OpenSource-Engineer",
        },
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({
        error: `GitHub API returned ${response.status}`,
      });
    }

    const data = (await response.json()) as {
      total_count: number;
      items: Array<{
        id: number;
        title: string;
        html_url: string;
        repository_url: string;
        user?: {
          login: string;
        };
        created_at: string;
        updated_at: string;
      }>;
    };

    const issues = data.items.map((issue) => ({
      id: issue.id,
      title: issue.title,
      url: issue.html_url,
      repository: issue.repository_url,
      user: issue.user?.login ?? "unknown",
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }));

    return res.json({
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("GitHub API error:", error);

    return res.status(500).json({
      error: "Failed to fetch GitHub issues",
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