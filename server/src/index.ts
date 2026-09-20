import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import aiRouter from "./routes/ai.js";

dotenv.config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.use("/api/ai", aiRouter);

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
      "https://api.github.com/search/issues?q=is%3Aissue%20is%3Aopen%20label%3Agood-first-issue&sort=updated&order=desc",
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});