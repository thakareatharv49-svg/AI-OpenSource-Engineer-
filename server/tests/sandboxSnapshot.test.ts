import assert from "node:assert/strict";
import testCase from "node:test";
import { selectSandboxSnapshotCandidates } from "../src/routes/sandbox.js";

testCase("snapshot prioritizes manifests and tests while excluding secrets and generated files", () => {
  const selected = selectSandboxSnapshotCandidates([
    { path: "src/main.ts", type: "blob", size: 120, sha: "a" },
    { path: "package.json", type: "blob", size: 100, sha: "b" },
    { path: "tests/main.test.ts", type: "blob", size: 150, sha: "c" },
    { path: ".env", type: "blob", size: 20, sha: "d" },
    { path: "src/.npmrc", type: "blob", size: 20, sha: "e" },
    { path: "node_modules/pkg/index.js", type: "blob", size: 20, sha: "f" },
    { path: ".github/workflows/ci.yml", type: "blob", size: 20, sha: "g" },
    { path: "../escape.ts", type: "blob", size: 20, sha: "h" },
    { path: "README.md", type: "blob", size: 100, sha: "i" },
  ]);
  assert.equal(selected[0].path, "package.json");
  assert.ok(selected.some((file) => file.path === "tests/main.test.ts"));
  assert.ok(selected.some((file) => file.path === "src/main.ts"));
  assert.ok(!selected.some((file) => file.path.includes(".env")));
  assert.ok(!selected.some((file) => file.path.includes(".npmrc")));
  assert.ok(!selected.some((file) => file.path.includes("node_modules")));
  assert.ok(!selected.some((file) => file.path.includes(".github/workflows")));
  assert.ok(!selected.some((file) => file.path.startsWith("..")));
});

testCase("snapshot candidates enforce file-count and file-size limits", () => {
  const entries = Array.from({ length: 100 }, (_, index) => ({
    path: `src/file-${index}.ts`,
    type: "blob",
    size: 100,
    sha: `sha-${index}`,
  }));
  entries.push({ path: "src/too-large.ts", type: "blob", size: 200_001, sha: "large" });
  const selected = selectSandboxSnapshotCandidates(entries);
  assert.equal(selected.length, 80);
  assert.ok(!selected.some((file) => file.path === "src/too-large.ts"));
});
