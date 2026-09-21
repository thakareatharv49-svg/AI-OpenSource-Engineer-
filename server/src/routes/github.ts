import { Router } from "express";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

/* ---------------- Get Repository Information ---------------- */

router.get("/repository/:owner/:repo", async (req, res) => {
  try {
    const { owner, repo } = req.params;

    if (!owner || !repo) {
      return res.status(400).json({
        error: "Repository owner and name are required",
      });
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "GITHUB_TOKEN is not configured",
      });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "AI-OpenSource-Engineer",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Failed to fetch repository information",
      });
    }

    return res.json({
      message: "Repository information fetched successfully",
      repository: {
        fullName: data.full_name,
        name: data.name,
        owner: data.owner.login,
        description: data.description,
        defaultBranch: data.default_branch,
        language: data.language,
        isPrivate: data.private,
        stars: data.stargazers_count,
        forks: data.forks_count,
        openIssues: data.open_issues_count,
        htmlUrl: data.html_url,
      },
    });
  } catch (error) {
    console.error("Repository information error:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch repository information",
    });
  }
});
/* ---------------- Create GitHub Branch ---------------- */

router.post("/branch", async (req, res) => {
  try {
    const { owner, repo, branchName, baseBranch } = req.body;

    if (!owner || !repo || !branchName || !baseBranch) {
      return res.status(400).json({
        error: "Owner, repository, branch name, and base branch are required",
      });
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "GITHUB_TOKEN is not configured",
      });
    }

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "AI-OpenSource-Engineer",
    };

    // Get the base branch reference
    const baseResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
      { headers }
    );

    const baseData = await baseResponse.json();

    if (!baseResponse.ok) {
      return res.status(baseResponse.status).json({
        error: baseData.message || "Failed to find base branch",
      });
    }

    const baseSha = baseData.object.sha;

    // Create the new branch
    const branchResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      }
    );

    const branchData = await branchResponse.json();

    if (!branchResponse.ok) {
      return res.status(branchResponse.status).json({
        error: branchData.message || "Failed to create branch",
      });
    }

    return res.status(201).json({
      message: "Branch created successfully",
      branch: {
        name: branchName,
        sha: baseSha,
        ref: branchData.ref,
      },
    });
  } catch (error) {
    console.error("Branch creation error:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to create GitHub branch",
    });
  }
});
/* ---------------- Create or Update GitHub File ---------------- */

router.put("/file", async (req, res) => {
  try {
    const {
      owner,
      repo,
      branchName,
      filePath,
      content,
      commitMessage,
    } = req.body;

    if (
      !owner ||
      !repo ||
      !branchName ||
      !filePath ||
      content === undefined ||
      !commitMessage
    ) {
      return res.status(400).json({
        error:
          "Owner, repository, branch, file path, content, and commit message are required",
      });
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "GITHUB_TOKEN is not configured",
      });
    }

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "AI-OpenSource-Engineer",
      "Content-Type": "application/json",
    };

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    // Check whether the file already exists
    const existingResponse = await fetch(
      `${apiUrl}?ref=${encodeURIComponent(branchName)}`,
      { headers }
    );

    let existingSha: string | undefined;

    if (existingResponse.ok) {
      const existingData = await existingResponse.json();
      existingSha = existingData.sha;
    } else if (existingResponse.status !== 404) {
      const errorData = await existingResponse.json();

      return res.status(existingResponse.status).json({
        error: errorData.message || "Failed to check existing file",
      });
    }

    // Create or update the file
    const fileResponse = await fetch(apiUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch: branchName,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });

    const fileData = await fileResponse.json();

    if (!fileResponse.ok) {
      return res.status(fileResponse.status).json({
        error: fileData.message || "Failed to commit file",
      });
    }

    return res.status(existingSha ? 200 : 201).json({
      message: existingSha
        ? "File updated successfully"
        : "File created successfully",
      commit: {
        sha: fileData.commit?.sha,
        htmlUrl: fileData.commit?.html_url,
      },
      file: {
        path: filePath,
        branch: branchName,
      },
    });
  } catch (error) {
    console.error("File commit error:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to commit GitHub file",
    });
  }
});
/* ---------------- Create GitHub Pull Request ---------------- */

router.post("/pull-request", async (req, res) => {
  try {
    const {
      owner,
      repo,
      title,
      body,
      headBranch,
      baseBranch,
    } = req.body;

    if (
      !owner ||
      !repo ||
      !title ||
      !headBranch ||
      !baseBranch
    ) {
      return res.status(400).json({
        error:
          "Owner, repository, title, head branch, and base branch are required",
      });
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "GITHUB_TOKEN is not configured",
      });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "AI-OpenSource-Engineer",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body: body || "",
          head: headBranch,
          base: baseBranch,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Failed to create pull request",
      });
    }

    return res.status(201).json({
      message: "Pull request created successfully",
      pullRequest: {
        number: data.number,
        title: data.title,
        state: data.state,
        htmlUrl: data.html_url,
        headBranch: data.head?.ref,
        baseBranch: data.base?.ref,
      },
    });
  } catch (error) {
    console.error("Pull request creation error:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to create pull request",
    });
  }
});
// Fork a repository
router.post("/fork", async (req, res) => {
  try {
    const { owner, repo } = req.body;

    if (!owner || !repo) {
      return res.status(400).json({
        error: "Owner and repository name are required",
      });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/forks`,
      {
        method: "POST",
        headers: {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
},
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Failed to fork repository",
      });
    }

    return res.status(201).json({
      message: "Repository forked successfully",
      repository: {
        fullName: data.full_name,
        owner: data.owner.login,
        name: data.name,
        htmlUrl: data.html_url,
        defaultBranch: data.default_branch,
      },
    });
  } catch (error) {
    console.error("Repository fork error:", error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fork repository",
    });
  }
});


export default router;