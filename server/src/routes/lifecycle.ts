import { Router } from "express";
import { CONTRIBUTION_STATES, createContribution, getContribution, listContributions, transitionContribution, type ContributionState } from "../security/contributionLifecycle.js";
const router = Router();
const userFrom = (res: { locals: Record<string, unknown> }) => {
  const session = res.locals.githubSession as { login?: string } | null | undefined;
  return typeof session?.login === "string" ? session.login : null;
};
router.get("/", async (_req, res) => {
  const user = userFrom(res);
  if (!user) return res.status(401).json({ error: "Sign in with GitHub to continue.", code: "AUTH_REQUIRED" });
  try { return res.json({ contributions: await listContributions(user) }); }
  catch { return res.status(503).json({ error: "Unable to read durable contribution state." }); }
});
router.post("/", async (req, res) => {
  const user = userFrom(res);
  if (!user) return res.status(401).json({ error: "Sign in with GitHub to continue.", code: "AUTH_REQUIRED" });
  const { idempotencyKey, issueUrl, repository } = req.body ?? {};
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey) ||
      typeof issueUrl !== "string" || issueUrl.length > 2048 ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*(?:[?#].*)?$/.test(issueUrl) ||
      typeof repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return res.status(400).json({ error: "A valid idempotency key, GitHub issue URL, and owner/repository are required." });
  }
  try {
    const result = await createContribution({ user, idempotencyKey, issueUrl, repository });
    return res.status(result.reused ? 200 : 201).json({ contribution: result.record, reused: result.reused });
  } catch (error) {
    const status = Number((error as { statusCode?: number }).statusCode) || 503;
    return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to create contribution workflow." });
  }
});
router.get("/:id", async (req, res) => {
  const user = userFrom(res);
  if (!user) return res.status(401).json({ error: "Sign in with GitHub to continue.", code: "AUTH_REQUIRED" });
  try {
    const contribution = await getContribution(user, req.params.id);
    return contribution ? res.json({ contribution }) : res.status(404).json({ error: "Contribution workflow not found." });
  } catch { return res.status(503).json({ error: "Unable to read durable contribution state." }); }
});
router.patch("/:id", async (req, res) => {
  const user = userFrom(res);
  if (!user) return res.status(401).json({ error: "Sign in with GitHub to continue.", code: "AUTH_REQUIRED" });
  const { state, expectedVersion, message } = req.body ?? {};
  if (typeof state !== "string" || !(CONTRIBUTION_STATES as readonly string[]).includes(state) ||
      typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 ||
      (message !== undefined && (typeof message !== "string" || message.length > 500))) {
    return res.status(400).json({ error: "A valid state, positive expectedVersion, and optional message (up to 500 characters) are required." });
  }
  try {
    const contribution = await transitionContribution({ user, id: req.params.id, to: state as ContributionState, expectedVersion, message });
    return res.json({ contribution });
  } catch (error) {
    const status = Number((error as { statusCode?: number }).statusCode) || 503;
    return res.status(status).json({ error: error instanceof Error ? error.message : "Unable to update contribution state." });
  }
});
export default router;
