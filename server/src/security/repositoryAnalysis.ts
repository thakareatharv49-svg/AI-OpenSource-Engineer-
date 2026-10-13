export type RepositoryAnalysisResult = {
  repositoryOverview: string;
  summary: string;
  relevantFiles: string[];
  rootCause: string;
  recommendedApproach: string;
  risks: string[];
};

const MAX_TEXT_LENGTH = 4_000;
const MAX_LIST_ITEMS = 30;
const MAX_LIST_ITEM_LENGTH = 2_000;

function isBoundedText(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isBoundedStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_LIST_ITEMS &&
    value.every((item) => isBoundedText(item, MAX_LIST_ITEM_LENGTH));
}

/** Validate untrusted model analysis and require every referenced file to exist in supplied context. */
export function validateRepositoryAnalysisResult(value: unknown, suppliedFilePaths: string[]): RepositoryAnalysisResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Array.isArray(suppliedFilePaths) || suppliedFilePaths.some((path) => typeof path !== "string")) return null;

  const candidate = value as Record<string, unknown>;
  if (!isBoundedText(candidate.repositoryOverview) ||
      !isBoundedText(candidate.summary) ||
      !isBoundedText(candidate.rootCause) ||
      !isBoundedText(candidate.recommendedApproach) ||
      !isBoundedStringList(candidate.relevantFiles) ||
      !isBoundedStringList(candidate.risks)) return null;

  const availablePaths = new Set(suppliedFilePaths);
  const relevantFiles = candidate.relevantFiles.map((path) => path.trim());
  if (relevantFiles.some((path) => !availablePaths.has(path)) ||
      new Set(relevantFiles).size !== relevantFiles.length) return null;

  return {
    repositoryOverview: candidate.repositoryOverview.trim(),
    summary: candidate.summary.trim(),
    relevantFiles,
    rootCause: candidate.rootCause.trim(),
    recommendedApproach: candidate.recommendedApproach.trim(),
    risks: candidate.risks.map((risk) => risk.trim()),
  };
}
