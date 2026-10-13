import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const CONTRIBUTION_STATES = [
  "discovered", "analyzing", "planning", "proposal_ready", "review_pending",
  "awaiting_approval", "fork_pending", "fork_ready", "branch_ready",
  "commit_preparing", "commit_complete", "retryable", "failed", "cancelled",
] as const;
export type ContributionState = typeof CONTRIBUTION_STATES[number];
export type LifecycleEvent = { at: string; from: ContributionState | null; to: ContributionState; message: string; retryable: boolean };
export type ContributionRecord = {
  id: string; user: string; idempotencyKey: string; issueUrl: string; repository: string;
  state: ContributionState; version: number; createdAt: string; updatedAt: string;
  retryCount: number; lastError: string | null; events: LifecycleEvent[];
};
type StoreData = { version: 1; records: ContributionRecord[] };
const MAX_RECORDS = 500;
const MAX_EVENTS = 100;
const storePath = () => resolve(process.env.CONTRIBUTION_STATE_PATH || ".data/contributions.json");
let writeQueue: Promise<unknown> = Promise.resolve();
const transitions: Record<ContributionState, ContributionState[]> = {
  discovered: ["analyzing", "cancelled", "failed"],
  analyzing: ["planning", "retryable", "failed", "cancelled"],
  planning: ["proposal_ready", "retryable", "failed", "cancelled"],
  proposal_ready: ["review_pending", "awaiting_approval", "retryable", "failed", "cancelled"],
  review_pending: ["awaiting_approval", "proposal_ready", "retryable", "failed", "cancelled"],
  awaiting_approval: ["fork_pending", "cancelled"],
  fork_pending: ["fork_ready", "retryable", "failed", "cancelled"],
  fork_ready: ["branch_ready", "retryable", "failed", "cancelled"],
  branch_ready: ["commit_preparing", "retryable", "failed", "cancelled"],
  commit_preparing: ["commit_complete", "retryable", "failed", "cancelled"],
  commit_complete: ["cancelled"],
  retryable: ["analyzing", "planning", "proposal_ready", "review_pending", "fork_pending", "fork_ready", "branch_ready", "commit_preparing", "failed", "cancelled"],
  failed: ["cancelled"],
  cancelled: [],
};
async function readStore(): Promise<StoreData> {
  try {
    const parsed = JSON.parse(await readFile(storePath(), "utf8")) as StoreData;
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error("Invalid contribution state store format");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, records: [] };
    throw error;
  }
}
async function writeStore(data: StoreData): Promise<void> {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600, flag: "wx" });
  await rename(temp, path);
}
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}
function redactMessage(message: string): string {
  return message
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED]")
    .replace(/(token|secret|password|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}
function addEvent(record: ContributionRecord, next: ContributionState, message: string, retryable = false) {
  const from = record.state;
  const safeMessage = redactMessage(message).slice(0, 500);
  record.state = next;
  record.version += 1;
  record.updatedAt = new Date().toISOString();
  record.lastError = next === "retryable" || next === "failed" ? safeMessage : null;
  if (next === "retryable" && from !== "retryable") record.retryCount += 1;
  record.events.push({ at: record.updatedAt, from, to: next, message: safeMessage, retryable });
  record.events = record.events.slice(-MAX_EVENTS);
}
export async function createContribution(input: { user: string; idempotencyKey: string; issueUrl: string; repository: string }): Promise<{ record: ContributionRecord; reused: boolean }> {
  return serialized(async () => {
    const data = await readStore();
    const existing = data.records.find(r => r.user.toLowerCase() === input.user.toLowerCase() && r.idempotencyKey === input.idempotencyKey);
    if (existing) {
      if (existing.issueUrl !== input.issueUrl || existing.repository.toLowerCase() !== input.repository.toLowerCase()) {
        throw Object.assign(new Error("Idempotency key was already used for a different contribution."), { statusCode: 409 });
      }
      return { record: existing, reused: true };
    }
    const now = new Date().toISOString();
    const record: ContributionRecord = {
      id: randomUUID(), user: input.user, idempotencyKey: input.idempotencyKey, issueUrl: input.issueUrl,
      repository: input.repository, state: "discovered", version: 1, createdAt: now, updatedAt: now,
      retryCount: 0, lastError: null,
      events: [{ at: now, from: null, to: "discovered", message: "Contribution workflow created", retryable: false }],
    };
    data.records.push(record);
    data.records = data.records.slice(-MAX_RECORDS);
    await writeStore(data);
    return { record, reused: false };
  });
}
export async function listContributions(user: string): Promise<ContributionRecord[]> {
  const data = await readStore();
  return data.records.filter(r => r.user.toLowerCase() === user.toLowerCase()).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getContribution(user: string, id: string): Promise<ContributionRecord | null> {
  const data = await readStore();
  return data.records.find(r => r.id === id && r.user.toLowerCase() === user.toLowerCase()) ?? null;
}
export async function transitionContribution(input: { user: string; id: string; to: ContributionState; expectedVersion: number; message?: string }): Promise<ContributionRecord> {
  return serialized(async () => {
    const data = await readStore();
    const record = data.records.find(r => r.id === input.id && r.user.toLowerCase() === input.user.toLowerCase());
    if (!record) throw Object.assign(new Error("Contribution workflow not found."), { statusCode: 404 });
    if (record.version !== input.expectedVersion) throw Object.assign(new Error("Contribution changed since it was loaded. Refresh before retrying."), { statusCode: 409, currentVersion: record.version });
    if (!CONTRIBUTION_STATES.includes(input.to)) throw Object.assign(new Error("Unknown contribution state."), { statusCode: 400 });
    if (!transitions[record.state].includes(input.to)) throw Object.assign(new Error(`Invalid lifecycle transition: ${record.state} → ${input.to}`), { statusCode: 409, currentState: record.state });
    addEvent(record, input.to, input.message?.trim() || `State changed to ${input.to}`, input.to === "retryable");
    await writeStore(data);
    return record;
  });
}
export async function clearContributionStoreForTests(): Promise<void> {
  await serialized(async () => writeStore({ version: 1, records: [] }));
}
