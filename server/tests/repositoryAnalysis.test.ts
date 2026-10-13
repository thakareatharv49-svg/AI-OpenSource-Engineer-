import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRepositoryAnalysisResult } from "../src/security/repositoryAnalysis.js";

const paths = ["src/index.ts", "src/parser.ts"];
const valid = {
  repositoryOverview: "A small TypeScript parser library.",
  summary: "The issue is caused by missing empty-input handling.",
  relevantFiles: ["src/parser.ts"],
  rootCause: "The parser reads the first token without checking input length.",
  recommendedApproach: "Add an early return for empty input and cover it with a regression test.",
  risks: ["Preserve behavior for non-empty inputs."],
};

test("accepts a complete analysis referencing supplied files", () => {
  assert.deepEqual(validateRepositoryAnalysisResult(valid, paths), valid);
});

test("rejects invented or duplicate relevant file paths", () => {
  assert.equal(validateRepositoryAnalysisResult({ ...valid, relevantFiles: ["src/missing.ts"] }, paths), null);
  assert.equal(validateRepositoryAnalysisResult({ ...valid, relevantFiles: ["src/parser.ts", "src/parser.ts"] }, paths), null);
});

test("rejects missing, blank, and oversized required text", () => {
  assert.equal(validateRepositoryAnalysisResult({ ...valid, rootCause: " " }, paths), null);
  assert.equal(validateRepositoryAnalysisResult({ ...valid, summary: "x".repeat(4_001) }, paths), null);
  assert.equal(validateRepositoryAnalysisResult({ ...valid, recommendedApproach: undefined }, paths), null);
});

test("rejects malformed and oversized lists", () => {
  assert.equal(validateRepositoryAnalysisResult({ ...valid, risks: [""] }, paths), null);
  assert.equal(validateRepositoryAnalysisResult({ ...valid, risks: Array(31).fill("risk") }, paths), null);
  assert.equal(validateRepositoryAnalysisResult({ ...valid, relevantFiles: ["src/parser.ts", 42] }, paths), null);
});

test("rejects malformed top-level values and unavailable path context", () => {
  assert.equal(validateRepositoryAnalysisResult(null, paths), null);
  assert.equal(validateRepositoryAnalysisResult([], paths), null);
  assert.equal(validateRepositoryAnalysisResult(valid, null as unknown as string[]), null);
});
