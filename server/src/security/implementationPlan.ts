export type ImplementationPlanResult = {
  solutionSummary: string;
  implementationSteps: string[];
  filesToModify: string[];
  codeChanges: string[];
  testsToAdd: string[];
  potentialProblems: string[];
};

const MAX_SUMMARY_LENGTH = 4_000;
const MAX_LIST_ITEMS = 30;
const MAX_ITEM_LENGTH = 2_000;

function boundedText(value: unknown, maxLength = MAX_ITEM_LENGTH): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function boundedList(value: unknown, minItems: number, maxItems = MAX_LIST_ITEMS): value is string[] {
  return Array.isArray(value) && value.length >= minItems && value.length <= maxItems &&
    value.every((item) => boundedText(item));
}

function safeRelativePath(value: string): boolean {
  if (value.length > 240 || value.startsWith("/") || value.startsWith("\\") ||
      /^[A-Za-z]:/.test(value) || value.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

/** Validate untrusted model output before an implementation plan reaches code generation. */
export function validateImplementationPlanResult(value: unknown): ImplementationPlanResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!boundedText(candidate.solutionSummary, MAX_SUMMARY_LENGTH) ||
      !boundedList(candidate.implementationSteps, 1) ||
      !boundedList(candidate.filesToModify, 1) ||
      !boundedList(candidate.codeChanges, 1) ||
      !boundedList(candidate.testsToAdd, 0) ||
      !boundedList(candidate.potentialProblems, 0)) return null;

  const files = candidate.filesToModify.map((path) => path.trim());
  if (files.some((path) => !safeRelativePath(path)) || new Set(files).size !== files.length) return null;

  return {
    solutionSummary: candidate.solutionSummary.trim(),
    implementationSteps: candidate.implementationSteps.map((item) => item.trim()),
    filesToModify: files,
    codeChanges: candidate.codeChanges.map((item) => item.trim()),
    testsToAdd: candidate.testsToAdd.map((item) => item.trim()),
    potentialProblems: candidate.potentialProblems.map((item) => item.trim()),
  };
}
