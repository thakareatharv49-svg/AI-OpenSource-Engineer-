import { Router } from "express";
import { runSandbox, type SandboxCheck, type SandboxFile, type SandboxRuntime } from "../security/dockerSandbox.js";

const router = Router();

type GitTreeEntry = { path: string; type: string; size?: number; sha?: string };

const SNAPSHOT_MAX_FILES = 80;
const SNAPSHOT_MAX_FILE_BYTES = 200_000;
const SNAPSHOT_MAX_TOTAL_BYTES = 800_000;
const SNAPSHOT_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|pyi|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|php|rb|vue|svelte|html|css|scss|sql|sh|ps1|yml|yaml|toml|json|md|txt|cfg|ini|lock)$/i;
const SNAPSHOT_IGNORED_PATH = /(^|\/)(node_modules|vendor|dist|build|coverage|\.git|\.next|\.venv|venv|__pycache__|\.idea|\.vscode)(\/|$)|(^|\/)\.github\/workflows(\/|$)/i;
const SNAPSHOT_IGNORED_FILE = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|credentials?(?:\.json)?|secrets?(?:\.json)?|id_rsa|id_ed25519)$/i;

export function selectSandboxSnapshotCandidates(entries: GitTreeEntry[]): GitTreeEntry[] {
  const score = (filePath: string) => {
    const normalized = filePath.toLowerCase();
    let rank = 0;
    if (/(^|\/)(package\.json|pyproject\.toml|requirements\.txt|setup\.py|setup\.cfg|go\.mod|cargo\.toml|gemfile|composer\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|cargo\.lock)$/.test(normalized)) rank += 100;
    if (/(^|\/)(tests?|specs?)(\/|$)|\.(test|spec)\.[^.]+$|(^|\/)[^/]+_test\.py$/.test(normalized)) rank += 80;
    if (/(^|\/)(src|app|lib|pkg|internal)(\/|$)/.test(normalized)) rank += 50;
    if (/^readme\.md$/i.test(filePath)) rank += 10;
    return rank;
  };

  return entries
    .filter((file) => {
      if (file.type !== "blob" || typeof file.sha !== "string" || typeof file.size !== "number") return false;
      if (file.size <= 0 || file.size > SNAPSHOT_MAX_FILE_BYTES || file.path.length > 240) return false;
      const parts = file.path.split("/");
      if (file.path.startsWith("/") || file.path.includes("\\") || /[?#\u0000-\u001f]/.test(file.path) || parts.some((part: string) => !part || part === "." || part === "..")) return false;
      if (SNAPSHOT_IGNORED_PATH.test(file.path) || SNAPSHOT_IGNORED_FILE.test(file.path)) return false;
      return SNAPSHOT_EXTENSIONS.test(file.path);
    })
    .sort((a, b) => score(b.path) - score(a.path) || a.path.localeCompare(b.path))
    .slice(0, SNAPSHOT_MAX_FILES);
}

async function fetchSandboxRepositorySnapshot(repository: string): Promise<{ files: SandboxFile[]; defaultBranch: string; totalBytes: number; treeTruncated: boolean }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "AI-OpenSource-Engineer",
  };
  const repositoryResponse = await fetch(`https://api.github.com/repos/${repository}`, { headers });
  if (!repositoryResponse.ok) throw new Error("GitHub could not return repository metadata");
  const repositoryData = await repositoryResponse.json() as { default_branch?: unknown };
  if (typeof repositoryData.default_branch !== "string" || !repositoryData.default_branch) {
    throw new Error("GitHub repository has no usable default branch");
  }
  const defaultBranch = repositoryData.default_branch;
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
    { headers },
  );
  if (!treeResponse.ok) throw new Error("GitHub could not return the repository tree");
  const treeData = await treeResponse.json() as { tree?: GitTreeEntry[]; truncated?: boolean };
  if (!Array.isArray(treeData.tree)) throw new Error("GitHub returned an invalid repository tree");
  const candidates = selectSandboxSnapshotCandidates(treeData.tree);
  const files: SandboxFile[] = [];
  let totalBytes = 0;
  for (const entry of candidates) {
    if (totalBytes >= SNAPSHOT_MAX_TOTAL_BYTES) break;
    const response = await fetch(`https://api.github.com/repos/${repository}/git/blobs/${entry.sha}`, { headers });
    if (!response.ok) continue;
    const blob = await response.json() as { encoding?: string; content?: string };
    if (blob.encoding !== "base64" || typeof blob.content !== "string") continue;
    const content = Buffer.from(blob.content, "base64").toString("utf8");
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes === 0 || bytes > SNAPSHOT_MAX_FILE_BYTES || totalBytes + bytes > SNAPSHOT_MAX_TOTAL_BYTES) continue;
    files.push({ path: entry.path, content });
    totalBytes += bytes;
  }
  return { files, defaultBranch, totalBytes, treeTruncated: treeData.truncated === true };
}


let sandboxBusy = false;
let activeRun: { runId: string; controller: AbortController } | null = null;

router.post("/snapshot", async (req, res) => {
  if (process.env.SANDBOX_ENABLED !== "true") {
    return res.status(503).json({ error: "Isolated checks are disabled." });
  }
  const repository = req.body && typeof req.body.repository === "string" ? req.body.repository : "";
  const repositoryParts: string[] = repository.split("/");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.length > 200 || repositoryParts.some((part) => part === "." || part === "..")) {
    return res.status(400).json({ error: "Provide a valid owner/repository identifier." });
  }
  if (!process.env.GITHUB_TOKEN) return res.status(503).json({ error: "Repository snapshots require GITHUB_TOKEN to be configured." });
  try {
    const snapshot = await fetchSandboxRepositorySnapshot(repository);
    if (snapshot.files.length === 0) {
      return res.status(422).json({ error: "No eligible text files could be included in the bounded repository snapshot." });
    }
    return res.json({
      repository,
      defaultBranch: snapshot.defaultBranch,
      files: snapshot.files,
      fileCount: snapshot.files.length,
      totalBytes: snapshot.totalBytes,
      treeTruncated: snapshot.treeTruncated,
      dependencyPolicy: "Dependencies are not installed; checks run offline against the supplied snapshot.",
      warning: snapshot.treeTruncated
        ? "GitHub truncated the repository tree; this snapshot may omit files. Oversized, binary, secret-like, and generated files are also excluded."
        : "This is a bounded source snapshot, not a complete clone. Oversized, binary, secret-like, and generated files are excluded.",
    });
  } catch {
    return res.status(502).json({ error: "Unable to prepare a repository snapshot from GitHub." });
  }
});

router.post("/run", async (req, res) => {
  if (process.env.SANDBOX_ENABLED !== "true") {
    return res.status(503).json({
      error: "Isolated checks are disabled. Set SANDBOX_ENABLED=true after installing Docker Desktop.",
    });
  }
  if (sandboxBusy) {
    res.setHeader("Retry-After", "5");
    return res.status(429).json({ error: "A sandbox check is already running. Retry shortly." });
  }

  const body = req.body as {
    runtime?: unknown;
    check?: unknown;
    files?: unknown;
    timeoutMs?: unknown;
    runId?: unknown;
  };
  if (
    !body ||
    !["node", "python"].includes(String(body.runtime)) ||
    !["test", "lint", "build", "typecheck"].includes(String(body.check)) ||
    !Array.isArray(body.files) ||
    typeof body.runId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.runId)
  ) {
    return res.status(400).json({ error: "Provide runtime, check, and a list of workspace files." });
  }

  sandboxBusy = true;
  const controller = new AbortController();
  activeRun = { runId: body.runId as string, controller };
  try {
    const result = await runSandbox({
      runtime: body.runtime as SandboxRuntime,
      check: body.check as SandboxCheck,
      files: body.files as SandboxFile[],
      timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : undefined,
    }, { signal: controller.signal });
    if (result.status === "unavailable") return res.status(503).json(result);
    return res.status(200).json(result);
  } finally {
    if (activeRun?.controller === controller) activeRun = null;
    sandboxBusy = false;
  }
});

router.post("/cancel", (req, res) => {
  if (process.env.SANDBOX_ENABLED !== "true") return res.status(503).json({ error: "Isolated checks are disabled." });
  const runId = req.body && typeof req.body.runId === "string" ? req.body.runId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) return res.status(400).json({ error: "Provide a valid sandbox runId." });
  if (!activeRun || activeRun.runId !== runId) return res.status(404).json({ error: "No active sandbox run matches this runId." });
  activeRun.controller.abort();
  return res.status(202).json({ status: "cancellation_requested" });
});

export default router;
