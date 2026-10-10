# Security Policy

## Reporting a vulnerability

Please do not publish credentials, exploit details, or an unpatched vulnerability in a public issue.

If GitHub's private vulnerability reporting is enabled for this repository, use **Security → Advisories → Report a vulnerability**. Otherwise, contact the repository maintainers privately through their GitHub profile and share only the minimum details needed to reproduce the issue. Include the affected commit, impact, reproduction steps, and any safe mitigation you know.

Do not include real access tokens, API keys, private keys, or personal data in a report.

## Security boundaries

- Keep `GITHUB_TOKEN`, `GEMINI_API_KEY`, and `OPENAI_API_KEY` in an untracked local `.env` file or an appropriate secret store. Never commit them.
- The backend binds to loopback by default. Do not expose it on a public interface without adding user authentication, HTTPS, deployment-grade rate limiting, and operational monitoring.
- CORS is not authentication. The local API uses loopback Host-header checks and a basic per-process AI request limit as defense in depth.
- Branch creation and file commits are restricted to a fork owned by the authenticated GitHub account. Pull requests use a head branch owned by that account.
- The commit API rejects common credential and private-key paths, but it cannot guarantee that arbitrary file contents are secret-free.
- Treat AI-generated changes as untrusted. The server applies a final static diff-safety gate before committing, but static checks can miss vulnerabilities and can flag legitimate code for review. Prompt-injection defenses are best-effort; review every diff.
- The API deliberately never executes generated code or test snippets. Run target-repository tests only in a disposable VM/container with no secrets and restricted network access. This repository's CI uses ephemeral GitHub-hosted runners, read-only repository permissions, checkout without persisted credentials, and job timeouts.
- Never run code from an untrusted repository on a machine that contains valuable credentials. Use a disposable container or virtual machine for execution and testing.

## Supported version

Security fixes target the latest commit on the default branch. Please include the commit SHA when reporting a suspected issue.
