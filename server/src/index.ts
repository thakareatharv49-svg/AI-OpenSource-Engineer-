import githubRouter from "./routes/github.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import aiRouter from "./routes/ai.js";

dotenv.config();

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

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"));
    },
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
const AI_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const AI_RATE_LIMIT_MAX = 20;

app.use("/api/ai", (req, res, next) => {
  const now = Date.now();
  for (const [key, bucket] of aiRequestBuckets) {
    if (bucket.resetAt <= now) aiRequestBuckets.delete(key);
  }

  const key = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = aiRequestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + AI_RATE_LIMIT_WINDOW_MS };
    aiRequestBuckets.set(key, bucket);
  }

  bucket.count += 1;
  res.setHeader("RateLimit-Policy", `${AI_RATE_LIMIT_MAX};w=600`);
  res.setHeader("RateLimit-Limit", String(AI_RATE_LIMIT_MAX));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, AI_RATE_LIMIT_MAX - bucket.count)));
  res.setHeader("RateLimit-Reset", String(Math.ceil((bucket.resetAt - now) / 1000)));

  if (bucket.count > AI_RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({
      error: "AI request limit reached. Please wait before trying again.",
    });
  }

  next();
});

app.use("/api/ai", aiRouter);
app.use("/api/github", githubRouter);

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

// GitHub authentication verification
app.get("/api/github/auth", async (_req, res) => {
  try {
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        message: "GITHUB_TOKEN is missing in the .env file",
      });
    }

    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "AI-OpenSource-Engineer",
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "GitHub authentication failed",
      });
    }

    const user = (await response.json()) as {
      login: string;
    };

    return res.json({
      success: true,
      message: "GitHub authentication successful",
      username: user.login,
    });
  } catch (error) {
    console.error("GitHub authentication error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to connect to GitHub",
    });
  }
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