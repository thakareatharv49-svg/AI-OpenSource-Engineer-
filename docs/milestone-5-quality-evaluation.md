# Milestone 5: Code quality and bounded repository context

- Deterministic issue-aware selection ranks relevant source, tests, and language/build manifests.
- Selection caps default to 16 files, 20 KB/file, and 120 KB aggregate context; helper limits are capped.
- Common generated/dependency directories, lockfiles, binary extensions, oversized files, and secret-like paths are excluded.
- Retrieved content is byte-budgeted and truncation plus GitHub tree truncation are exposed in repository analysis responses.
- Evaluation fixtures cover Python, Go, TypeScript/frontend issues, tests/manifests, deterministic limits, generated/secret-like filtering, and prompt-injection text as untrusted input.
- This remains a bounded GitHub-tree sample, not a complete clone or semantic index. Large/truncated repositories may need targeted retrieval.
- CI tests prove selector behavior, not that AI patches are correct or accepted upstream. Live GitHub OAuth, provider credentials, and Docker isolation remain separate local checks.
