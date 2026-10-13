import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCodeReviewResult } from "../src/security/codeReview.js";

const valid = { overallStatus: "Approved", summary: "The change is clear and addresses the issue.", bugs: [], securityIssues: [], codeQualityIssues: [], missingTests: [], suggestions: [], confidence: 88 };

test("accepts a complete review result with a bounded confidence score", () => {
  assert.deepEqual(validateCodeReviewResult(valid), valid);
});

test("rejects invalid verdicts, missing summaries, and invalid confidence", () => {
  for (const candidate of [{ ...valid, overallStatus: "Looks good" }, { ...valid, summary: " " }, { ...valid, confidence: 101 }, { ...valid, confidence: 88.5 }]) {
    assert.equal(validateCodeReviewResult(candidate), null);
  }
});

test("rejects missing, non-string, and oversized issue lists", () => {
  assert.equal(validateCodeReviewResult({ ...valid, bugs: "none" }), null);
  assert.equal(validateCodeReviewResult({ ...valid, suggestions: [42] }), null);
  assert.equal(validateCodeReviewResult({ ...valid, securityIssues: Array(101).fill("finding") }), null);
});

test("rejects malformed top-level values", () => {
  assert.equal(validateCodeReviewResult(null), null);
  assert.equal(validateCodeReviewResult("Approved"), null);
  assert.equal(validateCodeReviewResult([]), null);
});
