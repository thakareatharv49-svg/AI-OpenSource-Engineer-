import { Router } from "express";
import { runSandbox, type SandboxCheck, type SandboxFile, type SandboxRuntime } from "../security/dockerSandbox.js";

const router = Router();
let sandboxBusy = false;
let activeRun: { runId: string; controller: AbortController } | null = null;

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
