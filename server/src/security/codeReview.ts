export type CodeReviewResult = {
  overallStatus: "Approved" | "Changes Requested" | "Needs More Information";
  summary: string;
  bugs: string[];
  securityIssues: string[];
  codeQualityIssues: string[];
  missingTests: string[];
  suggestions: string[];
  confidence: number;
};

const issueLists = ["bugs", "securityIssues", "codeQualityIssues", "missingTests", "suggestions"] as const;

/** Reject malformed or overconfident model review output before it reaches the approval UI. */
export function validateCodeReviewResult(value: unknown): CodeReviewResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.overallStatus !== "Approved" && candidate.overallStatus !== "Changes Requested" && candidate.overallStatus !== "Needs More Information") return null;
  if (typeof candidate.summary !== "string" || !candidate.summary.trim() || candidate.summary.length > 4_000) return null;
  if (!Number.isInteger(candidate.confidence) || (candidate.confidence as number) < 0 || (candidate.confidence as number) > 100) return null;
  for (const key of issueLists) {
    if (!Array.isArray(candidate[key]) || !(candidate[key] as unknown[]).every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 2_000)) return null;
    if ((candidate[key] as unknown[]).length > 100) return null;
  }
  return {
    overallStatus: candidate.overallStatus,
    summary: candidate.summary.trim(),
    bugs: [...candidate.bugs as string[]],
    securityIssues: [...candidate.securityIssues as string[]],
    codeQualityIssues: [...candidate.codeQualityIssues as string[]],
    missingTests: [...candidate.missingTests as string[]],
    suggestions: [...candidate.suggestions as string[]],
    confidence: candidate.confidence as number,
  };
}

type ProposalReviewGate = {
  readyForHumanReview: boolean;
  safeToCommit: boolean;
  reasons: string[];
};

/** Deterministic proposal checks always override an optimistic model verdict. */
export function enforceProposalReviewGate(result: CodeReviewResult, gate: ProposalReviewGate): CodeReviewResult {
  if (gate.readyForHumanReview && gate.safeToCommit) return result;
  const findings = gate.reasons.length > 0 ? gate.reasons : ["The proposal did not pass deterministic validation."];
  return {
    ...result,
    overallStatus: "Changes Requested",
    summary: [result.summary, "Deterministic proposal validation failed; approval is blocked until the findings are resolved."].filter(Boolean).join(" "),
    securityIssues: [...new Set([...result.securityIssues, ...findings])],
  };
}
