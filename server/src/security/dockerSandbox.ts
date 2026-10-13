import { spawn } from "node:child_process";
import { mkdtemp, mkdir, chmod, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type SandboxRuntime = "node" | "python";
export type SandboxCheck = "test" | "lint" | "build" | "typecheck";

export interface SandboxFile {
  path: string;
  content: string;
}

export interface SandboxRequest {
  runtime: SandboxRuntime;
  check: SandboxCheck;
  files: SandboxFile[];
  timeoutMs?: number;
}

export interface SandboxResult {
  status: "passed" | "failed" | "timed_out" | "unavailable";
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  summary: string;
}

const MAX_FILES = 80;
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 800_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_CHARS = 32_000;

const CHECK_COMMANDS: Record<SandboxRuntime, Record<SandboxCheck, string>> = {
  node: {
    test: "npm test",
    lint: "npm run lint",
    build: "npm run build",
    typecheck: "npm run typecheck",
  },
  python: {
    test: "python -m unittest",
    lint: "python -m compileall -q .",
    build: "python -m compileall -q .",
    typecheck: "python -m compileall -q .",
  },
};

const IMAGES: Record<SandboxRuntime, string> = {
  node: "node:22-alpine",
  python: "python:3.12-alpine",
};

function validateRequest(input: SandboxRequest): string | null {
  if (!input || !["node", "python"].includes(input.runtime)) {
    return "Choose a supported sandbox runtime.";
  }
  if (!["test", "lint", "build", "typecheck"].includes(input.check)) {
    return "Choose a supported check.";
  }
  if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > MAX_FILES) {
    return `Provide between 1 and ${MAX_FILES} workspace files.`;
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  for (const file of input.files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      return "Each workspace file must include a path and text content.";
    }
    const segments = file.path.split("/");
    if (
      file.path.length === 0 ||
      file.path.length > 240 ||
      file.path.startsWith("/") ||
      file.path.includes("\\") ||
      /[?#\u0000-\u001f]/.test(file.path) ||
      segments.some((part) => !part || part === "." || part === "..") ||
      /^[A-Za-z]:/.test(file.path)
    ) {
      return "Workspace contains an unsafe relative path.";
    }
    const normalized = file.path.toLowerCase();
    if (seen.has(normalized)) return "Workspace contains duplicate file paths.";
    seen.add(normalized);

    const bytes = Buffer.byteLength(file.content, "utf8");
    if (bytes === 0 || bytes > MAX_FILE_BYTES) return "A workspace file is empty or exceeds 200 KB.";
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) return "Workspace content exceeds 800 KB.";
  }

  if (input.runtime === "node" && !input.files.some((file) => file.path === "package.json")) {
    return "Node checks require a package.json file.";
  }
  if (input.runtime === "python" && input.check === "test" && !input.files.some((file) => /(^|\/)(test[^/]*\.py|[^/]*_test\.py)$/.test(file.path))) {
    return "Python test execution requires at least one test file; compile checks may use any Python source.";
  }
  return null;
}

export function buildSandboxDockerArgs(workspacePath: string, request: SandboxRequest): string[] {
  const command = `cp -R /input/. /workspace/ && ${CHECK_COMMANDS[request.runtime][request.check]}`;
  const mountSource = path.resolve(workspacePath).split(String.fromCharCode(92)).join("/");
  return [
    "run",
    "--rm",
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=64",
    "--memory=512m",
    "--cpus=1",
    "--ulimit=nofile=256:256",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    "--tmpfs", "/workspace:rw,nosuid,nodev,size=128m,mode=1777",
    "--user=65532:65532",
    "--workdir=/workspace",
    "--mount", `type=bind,src=${mountSource},dst=/input,readonly`,
    IMAGES[request.runtime],
    "sh",
    "-lc",
    command,
  ];
}

export async function runSandbox(
  request: SandboxRequest,
  dependencies: { spawnProcess?: typeof spawn } = {},
): Promise<SandboxResult> {
  const spawnProcess = dependencies.spawnProcess ?? spawn;
  const invalid = validateRequest(request);
  if (invalid) {
    return {
      status: "failed",
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      outputTruncated: false,
      summary: invalid,
    };
  }

  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(1_000, Number.isFinite(request.timeoutMs) ? Number(request.timeoutMs) : 30_000),
  );
  const startedAt = Date.now();
  let workspace = "";
  try {
    workspace = await mkdtemp(path.join(os.tmpdir(), "ai-oss-sandbox-"));
    await chmod(workspace, 0o777);
    for (const file of request.files) {
      const destination = path.resolve(workspace, ...file.path.split("/"));
      if (!destination.startsWith(workspace + path.sep)) {
        throw new Error("Unsafe workspace path.");
      }
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o777 });
      await chmod(path.dirname(destination), 0o777);
      await writeFile(destination, file.content, { encoding: "utf8", mode: 0o666, flag: "wx" });
      await chmod(destination, 0o666);
    }

    const containerName = "ai-oss-sandbox-" + randomUUID();
    const args = buildSandboxDockerArgs(workspace, request);
    args.splice(1, 0, "--name", containerName);
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; truncated: boolean }>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let truncated = false;
      let settled = false;
      const child = spawnProcess("docker", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      const finish = (value: { code: number | null; stdout: string; stderr: string; timedOut: boolean; truncated: boolean }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
        const killer = spawnProcess("docker", ["kill", containerName], { stdio: "ignore", windowsHide: true });
        killer.on("error", () => finish({ code: null, stdout, stderr, timedOut, truncated }));
        killer.on("close", () => finish({ code: null, stdout, stderr, timedOut, truncated }));
      }, timeoutMs);
      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT_CHARS) stdout += chunk.toString("utf8").slice(0, MAX_OUTPUT_CHARS - stdout.length);
        if (stdout.length >= MAX_OUTPUT_CHARS) truncated = true;
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_CHARS) stderr += chunk.toString("utf8").slice(0, MAX_OUTPUT_CHARS - stderr.length);
        if (stderr.length >= MAX_OUTPUT_CHARS) truncated = true;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(error);
      });
      child.on("close", (code) => {
        if (!timedOut) finish({ code, stdout, stderr, timedOut, truncated });
      });
    });

    const durationMs = Date.now() - startedAt;
    if (result.timedOut) {
      return { status: "timed_out", exitCode: null, durationMs, stdout: result.stdout, stderr: result.stderr, outputTruncated: result.truncated, summary: `Sandbox check exceeded the ${Math.round(timeoutMs / 1000)} second time limit.` };
    }
    return {
      status: result.code === 0 ? "passed" : "failed",
      exitCode: result.code,
      durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
      outputTruncated: result.truncated,
      summary: result.code === 0 ? "Sandbox check completed successfully." : `Sandbox check failed with exit code ${String(result.code)}.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sandbox error";
    const unavailable = message.includes("ENOENT") || message.includes("docker");
    return {
      status: unavailable ? "unavailable" : "failed",
      exitCode: null,
      durationMs: Date.now() - startedAt,
      stdout: "",
      stderr: "",
      outputTruncated: false,
      summary: unavailable ? "Docker is unavailable. Install and start Docker Desktop to enable isolated checks." : `Sandbox setup failed: ${message}`,
    };
  } finally {
    if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
  }
}
