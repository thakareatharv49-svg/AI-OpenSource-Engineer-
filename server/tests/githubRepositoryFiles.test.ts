import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchSelectedRepositoryFiles } from "../src/security/githubRepositoryFiles.js";

const headers = { Authorization: "Bearer test-token" };
const file = { path: "src/parser.ts" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});
const githubFile = (content: string) => ({
  type: "file",
  encoding: "base64",
  content: Buffer.from(content, "utf8").toString("base64"),
});

test("fetches and decodes complete UTF-8 repository files", async () => {
  const result = await fetchSelectedRepositoryFiles("example/project", "main", [file], headers, async () => response(githubFile("export const value = 'é';\n")));
  assert.deepEqual(result, [{ path: file.path, content: "export const value = 'é';\n" }]);
});

test("fails analysis instead of silently replacing a failed source fetch with empty content", async () => {
  await assert.rejects(
    fetchSelectedRepositoryFiles("example/project", "main", [file], headers, async () => response({ message: "rate limited" }, 403)),
    /src\/parser\.ts.*HTTP 403.*incomplete source/,
  );
});

test("rejects missing, unsupported, and malformed GitHub content payloads", async () => {
  for (const payload of [
    { type: "file", encoding: "none", content: "" },
    { type: "file", encoding: "base64" },
    { type: "file", encoding: "base64", content: "%%%=" },
    { type: "dir", encoding: "base64", content: "" },
  ]) {
    await assert.rejects(
      fetchSelectedRepositoryFiles("example/project", "main", [file], headers, async () => response(payload)),
      /incomplete|unsupported|malformed/,
    );
  }
});

test("encodes nested file paths safely and pins requests to the selected branch", async () => {
  let requested = "";
  await fetchSelectedRepositoryFiles("example/project", "feature/a", [{ path: "src/nested file.ts" }], headers, async (input) => {
    requested = String(input);
    return response(githubFile("ok"));
  });
  assert.equal(requested, "https://api.github.com/repos/example/project/contents/src/nested%20file.ts?ref=feature%2Fa");
});
