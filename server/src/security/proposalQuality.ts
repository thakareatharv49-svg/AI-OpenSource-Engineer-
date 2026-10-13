import { inspectProposedChanges, type SafetyReport } from "./diffSafety.js";

export type ProposalQualityGate = {
  validStructure: boolean;
  fileCount: number;
  readyForHumanReview: boolean;
  safeToCommit: boolean;
  safetyReport: SafetyReport;
  reasons: string[];
};

const MAX_TEXT_LENGTH = 20_000;
const MAX_SUMMARY_LENGTH = 4_000;
const MAX_LIST_ITEMS = 30;
const MAX_TOTAL_PROPOSAL_BYTES = 500_000;

function isBoundedText(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_LIST_ITEMS &&
    value.every((item) => isBoundedText(item, 4_000));
}

function isOptionalStringList(candidate: Record<string, unknown>, key: string): boolean {
  return candidate[key] === undefined || isStringList(candidate[key]);
}

function validateProposalStructure(value: unknown): { valid: boolean; changes: unknown[]; reasons: string[] } {
  const reasons: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, changes: [], reasons: ["Proposal must be a JSON object."] };
  }

  const candidate = value as Record<string, unknown>;
  const changes = Array.isArray(candidate.changes) ? candidate.changes : [];
  let valid = isBoundedText(candidate.summary, MAX_SUMMARY_LENGTH) &&
    Array.isArray(candidate.changes) && changes.length > 0 && changes.length <= MAX_LIST_ITEMS;

  if (!isBoundedText(candidate.summary, MAX_SUMMARY_LENGTH)) reasons.push("Proposal summary is missing or exceeds the size limit.");
  if (!Array.isArray(candidate.changes) || changes.length === 0) reasons.push("Proposal must contain at least one file change.");
  if (changes.length > MAX_LIST_ITEMS) reasons.push("Proposal exceeds the 30-file limit.");

  for (const [index, change] of changes.entries()) {
    const label = `Change ${index + 1}`;
    if (!change || typeof change !== "object" || Array.isArray(change)) {
      valid = false;
      reasons.push(`${label} must be an object.`);
      continue;
    }

    const item = change as Record<string, unknown>;
    if (!isBoundedText(item.file, 240)) {
      valid = false;
      reasons.push(`${label} has no valid file path.`);
    }
    if (!isBoundedText(item.purpose, 4_000)) {
      valid = false;
      reasons.push(`${label} is missing a bounded purpose.`);
    }
    if (!isBoundedText(item.after, 200_000)) {
      valid = false;
      reasons.push(`${label} has no complete replacement content or exceeds the per-file limit.`);
    }
    if (!isBoundedText(item.explanation, 4_000)) {
      valid = false;
      reasons.push(`${label} is missing a bounded explanation.`);
    }
    if (item.before !== undefined && (typeof item.before !== "string" || item.before.length > 200_000)) {
      valid = false;
      reasons.push(`${label} has invalid or oversized before-content.`);
    }
  }

  for (const key of ["assumptions", "verificationSteps", "warnings"]) {
    if (!isOptionalStringList(candidate, key)) {
      valid = false;
      reasons.push(`Proposal field "${key}" must be a bounded list of non-empty strings.`);
    }
  }

  if (candidate.tests !== undefined) {
    if (!Array.isArray(candidate.tests) || candidate.tests.length > MAX_LIST_ITEMS) {
      valid = false;
      reasons.push('Proposal field "tests" must be a list of at most 30 test descriptions.');
    } else {
      for (const [index, entry] of candidate.tests.entries()) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          valid = false;
          reasons.push(`Test ${index + 1} must be an object.`);
          continue;
        }
        const test = entry as Record<string, unknown>;
        if (!isBoundedText(test.file, 240) || !isBoundedText(test.description, 4_000) ||
            !isBoundedText(test.code, 200_000)) {
          valid = false;
          reasons.push(`Test ${index + 1} is missing a valid file, description, or complete code.`);
        }
      }
    }
  }

  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_TOTAL_PROPOSAL_BYTES) {
    valid = false;
    reasons.push("Proposal exceeds the 500 KB total size limit.");
  }

  return { valid, changes, reasons };
}

export function validateGeneratedProposal(value: unknown): ProposalQualityGate {
  const structure = validateProposalStructure(value);
  const safetyReport = inspectProposedChanges(structure.changes);
  const reasons = [...structure.reasons];

  for (const finding of safetyReport.findings) {
    reasons.push(`${finding.severity === "block" ? "Blocked" : "Manual review required"}: ${finding.file} — ${finding.reason}`);
  }

  const hasBlockingFinding = safetyReport.findings.some((finding) => finding.severity === "block");
  const readyForHumanReview = structure.valid && !hasBlockingFinding;
  return {
    validStructure: structure.valid,
    fileCount: structure.changes.length,
    readyForHumanReview,
    safeToCommit: structure.valid && safetyReport.safeToCommit,
    safetyReport,
    reasons: [...new Set(reasons)],
  };
}
