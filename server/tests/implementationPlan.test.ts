import assert from "node:assert/strict";
import { test } from "node:test";
import { validateImplementationPlanResult } from "../src/security/implementationPlan.js";

const valid = {
  solutionSummary: "Handle empty parser input without changing existing behavior.",
  implementationSteps: ["Inspect parser entry point", "Add an empty-input guard"],
  filesToModify: ["src/parser.ts", "tests/parser.test.ts"],
  codeChanges: ["Return an empty result for empty input", "Add a regression test"],
  testsToAdd: ["Empty input returns an empty result"],
  potentialProblems: ["Preserve existing non-empty input behavior"],
};

test("accepts a complete bounded implementation plan", () => {
  assert.deepEqual(validateImplementationPlanResult(valid), valid);
});

test("rejects missing or malformed required fields", () => {
  assert.equal(validateImplementationPlanResult(null), null);
  assert.equal(validateImplementationPlanResult([]), null);
  assert.equal(validateImplementationPlanResult({ ...valid, solutionSummary: " " }), null);
  assert.equal(validateImplementationPlanResult({ ...valid, implementationSteps: [] }), null);
  assert.equal(validateImplementationPlanResult({ ...valid, filesToModify: ["src/a.ts", 3] }), null);
});

test("rejects unsafe and duplicate file paths", () => {
  for (const path of ["../outside.ts", "/etc/passwd", "C:/temp/file.ts", "src\\file.ts", "src/../secret.ts", "src//file.ts"]) {
    assert.equal(validateImplementationPlanResult({ ...valid, filesToModify: [path] }), null, path);
  }
  assert.equal(validateImplementationPlanResult({ ...valid, filesToModify: ["src/a.ts", "src/a.ts"] }), null);
});

test("rejects oversized lists and list items", () => {
  assert.equal(validateImplementationPlanResult({ ...valid, implementationSteps: Array(31).fill("step") }), null);
  assert.equal(validateImplementationPlanResult({ ...valid, potentialProblems: ["x".repeat(2_001)] }), null);
  assert.equal(validateImplementationPlanResult({ ...valid, codeChanges: "change" }), null);
});

test("allows optional concern lists to be empty", () => {
  assert.ok(validateImplementationPlanResult({ ...valid, testsToAdd: [], potentialProblems: [] }));
});
