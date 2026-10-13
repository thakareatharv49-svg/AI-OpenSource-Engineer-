export type ValidatedIssueSelection = {
  selectedIssueId: number;
  reason: string;
  difficulty: "Easy" | "Medium" | "Hard";
  confidence: number;
};

/** Validate untrusted model output against the exact issue list supplied by the caller. */
export function validateIssueSelectionResult(value: unknown, issues: unknown[]): ValidatedIssueSelection | null {
  if (!value || typeof value !== "object" || !Array.isArray(issues)) return null;
  const candidate = value as Record<string, unknown>;
  const selectedIssueId = candidate.selectedIssueId;
  if (!Number.isSafeInteger(selectedIssueId) || (selectedIssueId as number) <= 0) return null;
  const matches = issues.filter((issue) => issue !== null && typeof issue === "object" && (issue as Record<string, unknown>).id === selectedIssueId);
  if (matches.length !== 1) return null;
  if (typeof candidate.reason !== "string" || !candidate.reason.trim() || candidate.reason.length > 2_000) return null;
  if (candidate.difficulty !== "Easy" && candidate.difficulty !== "Medium" && candidate.difficulty !== "Hard") return null;
  if (typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 100) return null;
  return { selectedIssueId: selectedIssueId as number, reason: candidate.reason.trim(), difficulty: candidate.difficulty, confidence: candidate.confidence };
}
