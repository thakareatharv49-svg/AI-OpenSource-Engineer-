import { Router } from "express";
import { runSandbox, type SandboxCheck, type SandboxFile, type SandboxRuntime } from "../security/dockerSandbox.js";

const router = Router();
let sandboxBusy = false;

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
  };
  if (
    !body ||
    !["node", "python"].includes(String(body.runtime)) ||
    !["test", "lint", "build", "typecheck"].includes(String(body.check)) ||
    !Array.isArray(body.files)
  ) {
    return res.status(400).json({ error: "Provide runtime, check, and a list of workspace files." });
  }

  sandboxBusy = true;
  try {
    const result = await runSandbox({
      runtime: body.runtime as SandboxRuntime,
      check: body.check as SandboxCheck,
      files: body.files as SandboxFile[],
      timeoutMs: typeof body.timeoutMs === "number" ? body.timeoutMs : undefined,
    });
    if (result.status === "unavailable") return res.status(503).json(result);
    return res.status(200).json(result);
  } finally {
    sandboxBusy = false;
  }
});

export default router;
