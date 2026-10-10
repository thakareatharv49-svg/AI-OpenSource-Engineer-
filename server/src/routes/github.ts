import { Router } from "express";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const isValidRepositoryPart = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_.-]+$/.test(value);

const isValidGitRef = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 240 &&
  !value.startsWith("/") &&
  !value.endsWith("/") &&
  !value.includes("..") &&
  !value.includes("@{") &&
  !/[\s~^:?*\[\]\\]/.test(value) &&
  !value.endsWith(".lock") &&
  !value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith("."));

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "AI-OpenSource-Engineer",
});

type ForkCheck =
  | { ok: true; login: string }
  | { ok: false; status: number; error: string };

async function verifyAuthenticatedFork(
  token: string,
  owner: string,
  repo: string
): Promise<ForkCheck> {
  const headers = githubHeaders(token);
  const userResponse = await fetch("https://api.github.com/user", { headers });
  if (!userResponse.ok) {
    return { ok: false, status: 502, error: "Unable to verify the GitHub account for this operation." };
  }

  const user = (await userResponse.json()) as { login?: string };
  if (!user.login || user.login.toLowerCase() !== owner.toLowerCase()) {
    return { ok: false, status: 403, error: "Write operations are allowed only on a repository owned by the authenticated GitHub account." };
  }

  const repositoryResponse = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers }
  );
  if (!repositoryResponse.ok) {
    return { ok: false, status: repositoryResponse.status === 404 ? 404 : 502, error: "Unable to verify the target repository." };
  }

  const repository = (await repositoryResponse.json()) as {
    full_name?: string;
    fork?: boolean;
    parent?: { full_name?: string };
  };
  if (
    repository.fork !== true ||
    !repository.parent?.full_name ||
    repository.parent.full_name.toLowerCase() === repository.full_name?.toLowerCase()
  ) {
    return { ok: false, status: 403, error: "For safety, branch creation and file commits are restricted to a fork of an upstream repository." };
  }

  return { ok: true, login: user.login };
}

/* ---------------- Get Repository Information ---------------- */

router.get("/repository/:owner/:repo", async (req, res) => {
  try {
    const { owner, repo } = req.params;

    if (!isValidRepositoryPart(owner) || !isValidRepositoryPart(repo)) {
      return res.status(400).json({
        error: "Invalid GitHub repository owner or name",
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

    if (!isValidRepositoryPart(owner) || !isValidRepositoryPart(repo)) {
      return res.status(400).json({
        error: "Invalid GitHub repository owner or name",
      });
    }
    if (!isValidGitRef(branchName) || !isValidGitRef(baseBranch)) {
      return res.status(400).json({
        error: "Branch name and base branch must be valid Git refs",
      });
    }

    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "GITHUB_TOKEN is not configured",
      });
    }

    const forkCheck = await verifyAuthenticatedFork(token, owner, repo);
    if (!forkCheck.ok) {
      return res.status(forkCheck.status).json({ error: forkCheck.error });
    }

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "AI-OpenSource-Engineer",
    };

    // Get the base branch reference
    const baseResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
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
      typeof filePath !== "string" ||
      !filePath ||
      typeof content !== "string" ||
      !commitMessage
    ) {
      return res.status(400).json({
        error:
          "Owner, repository, branch, file path, content, and commit message are required",
      });
    }

    if (!isValidRepositoryPart(owner) || !isValidRepositoryPart(repo)) {
      return res.status(400).json({
        error: "Invalid GitHub repository owner or name",
      });
    }
    if (!isValidGitRef(branchName)) {
      return res.status(400).json({
        error: "Branch name must be a valid Git ref",
      });
    }

    const pathSegments = String(filePath).split("/");
    const unsafePath =
      filePath.startsWith("/") ||
      filePath.includes("\\") ||
      pathSegments.some((segment: string) => !segment || segment === "." || segment === "..") ||
      pathSegments.some((segment: string) =>
        /^\.env(?:\.|$)/i.test(segment) ||
        /^\.npmrc$/i.test(segment) ||
        /^\.pypirc$/i.test(segment) ||
        /^\.netrc$/i.test(segment) ||
        /^\.ssh$/i.test(segment) ||
        /^\.aws$/i.test(segment) ||
        /^(?:secrets?|credentials?)$/i.test(segment)
      ) ||
      /(^|\/)(?:id_rsa|id_ed25519|id_ecdsa|private_key|credentials\.json)$/i.test(filePath) ||
      /[?#\u0000-\u001f]/.test(filePath);

    if (unsafePath) {
      return res.status(400).json({
        error: "File path must be a safe repository-relative path",
      });
    }

    if (Buffer.byteLength(String(content), "utf8") > 200_000) {
      return res.status(413).json({
        error: "File content exceeds the 200 KB limit",
      });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(500).json({
        error: "GITHUB_TOKEN is not configured",
      });
    }

    const forkCheck = await verifyAuthenticatedFork(token, owner, repo);
    if (!forkCheck.ok) {
      return res.status(forkCheck.status).json({ error: forkCheck.error });
    }

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "AI-OpenSource-Engineer",
      "Content-Type": "application/json",
    };

    const encodedPath = pathSegments.map((segment: string) => encodeURIComponent(segment)).join("/");
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

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

    if (!isValidRepositoryPart(owner) || !isValidRepositoryPart(repo)) {
      return res.status(400).json({
        error: "Invalid GitHub repository owner or name",
      });
    }
    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.length > 256 ||
      !isValidGitRef(baseBranch) ||
      typeof headBranch !== "string" ||
      !/^[A-Za-z0-9_.-]+:[^\\s]+$/.test(headBranch) ||
      !isValidGitRef(headBranch.split(":").slice(1).join(":"))
    ) {
      return res.status(400).json({
        error: "Title, head branch, and base branch must be valid; title is required",
      });
    }

    if (body !== undefined && (typeof body !== "string" || body.length > 20_000)) {
      return res.status(400).json({ error: "Pull request description must be text no longer than 20,000 characters." });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(500).json({
        error: "GITHUB_TOKEN is not configured",
      });
    }

    const authenticatedUserResponse = await fetch("https://api.github.com/user", {
      headers: githubHeaders(token),
    });
    if (!authenticatedUserResponse.ok) {
      return res.status(502).json({ error: "Unable to verify the GitHub account for pull request creation." });
    }
    const authenticatedUser = (await authenticatedUserResponse.json()) as { login?: string };
    const headOwner = headBranch.split(":")[0];
    if (!authenticatedUser.login || headOwner.toLowerCase() !== authenticatedUser.login.toLowerCase()) {
      return res.status(403).json({ error: "Pull requests may only use a head branch owned by the authenticated GitHub account." });
    }

    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
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

    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(500).json({
        error: "GITHUB_TOKEN is not configured",
      });
    }

    if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
      return res.status(400).json({
        error: "Invalid GitHub repository owner or name",
      });
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/forks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "AI-OpenSource-Engineer",
        },
      }
    );

    let data = await response.json();

    if (!response.ok && response.status === 422) {
      // GitHub returns 422 when the authenticated user already has a fork.
      // Reuse that fork only when its parent is the requested upstream repo.
      const userResponse = await fetch("https://api.github.com/user", {
        headers: githubHeaders(token),
      });
      if (userResponse.ok) {
        const user = (await userResponse.json()) as { login?: string };
        if (user.login) {
          const existingResponse = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(user.login)}/${encodeURIComponent(repo)}`,
            { headers: githubHeaders(token) }
          );
          if (existingResponse.ok) {
            const existing = await existingResponse.json();
            if (
              typeof existing.parent?.full_name === "string" &&
              existing.parent.full_name.toLowerCase() === `${owner}/${repo}`.toLowerCase()
            ) {
              data = existing;
            } else {
              return res.status(409).json({
                error: "A repository with this name already exists in your account but is not a fork of the selected upstream repository.",
              });
            }
          } else {
            return res.status(response.status).json({
              error: data.message || "GitHub rejected the fork request.",
            });
          }
        } else {
          return res.status(response.status).json({
            error: data.message || "GitHub rejected the fork request.",
          });
        }
      } else {
        return res.status(response.status).json({
          error: data.message || "GitHub rejected the fork request.",
        });
      }
    } else if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Failed to fork repository",
      });
    }

    if (!data.full_name || !data.owner?.login || !data.name) {
      return res.status(503).json({
        error: "GitHub accepted the fork request, but the fork is still initializing. Retry the fork step shortly.",
        pending: true,
      });
    }

    return res.status(response.status === 422 ? 200 : 201).json({
      message: response.status === 422 ? "Existing fork reused successfully" : "Repository forked successfully",
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