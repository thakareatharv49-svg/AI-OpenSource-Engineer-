import { inspectProposedChanges, type SafetyReport } from "./diffSafety.js";

export type ProposalQualityGate = {
  validStructure: boolean;
  fileCount: number;
  readyForHumanReview: boolean;
  safeToCommit: boolean;
  safetyReport: SafetyReport;
  reasons: string[];
};

export function validateGeneratedProposal(value: unknown): ProposalQualityGate {
  const reasons: string[] = [];
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const changes = Array.isArray(candidate.changes) ? candidate.changes : [];
  let validStructure = typeof candidate.summary === "string" && candidate.summary.trim().length > 0 &&
    Array.isArray(candidate.changes) && changes.length > 0 && changes.length <= 30;

  if (typeof candidate.summary !== "string" || !candidate.summary.trim()) reasons.push("Proposal summary is missing.");
  if (!Array.isArray(candidate.changes) || changes.length === 0) reasons.push("Proposal must contain at least one file change.");
  if (changes.length > 30) reasons.push("Proposal exceeds the 30-file limit.");

  for (const [index, change] of changes.entries()) {
    if (!change || typeof change !== "object") {
      validStructure = false;
      reasons.push(`Change ${index + 1} must be an object.`);
      continue;
    }
    const item = change as Record<string, unknown>;
    if (typeof item.file !== "string" || !item.file.trim()) {
      validStructure = false;
      reasons.push(`Change ${index + 1} has no file path.`);
    }
    if (typeof item.after !== "string" || !item.after.trim()) {
      validStructure = false;
      reasons.push(`Change ${index + 1} has no complete replacement content.`);
    }
  }

  const safetyReport = inspectProposedChanges(changes);
  for (const finding of safetyReport.findings) {
    reasons.push(`${finding.severity === "block" ? "Blocked" : "Manual review required"}: ${finding.file} — ${finding.reason}`);
  }
  const hasBlockingFinding = safetyReport.findings.some((finding) => finding.severity === "block");
  const readyForHumanReview = validStructure && !hasBlockingFinding;
  return {
    validStructure,
    fileCount: changes.length,
    readyForHumanReview,
    safeToCommit: validStructure && safetyReport.safeToCommit,
    safetyReport,
    reasons: [...new Set(reasons)],
  };
}
