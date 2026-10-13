# AI Open Source Engineer

An AI-assisted open-source contribution workflow that discovers issues, analyzes repository source, drafts and reviews concrete file changes, and prepares a contribution in a fork. **A person must approve the contribution, and creating the pull request remains a separate, explicit action.**

## Features

- Discover open GitHub issues labelled `good-first-issue`
- Use AI to select an issue and analyze repository source files
- Generate an implementation plan and proposed file contents
- Review the proposal with an AI reviewer
- After human approval, fork the upstream repository, create a branch, and commit the proposed source files as one atomic Git commit (all proposed files land together or the branch remains unchanged)
- Create a pull request against the original repository only when the user clicks **Create Pull Request**
- Retry failed fork, branch, and proposal-commit operations without starting an unbounded request loop

## Stack

- **Frontend:** React, TypeScript, Vite, React Router
- **Backend:** Node.js, Express, TypeScript
- **Integrations:** GitHub API, Gemini, OpenAI, and local Ollama fallback

## Requirements

- Node.js 22 or newer
- npm
- A GitHub token with the permissions needed to read public repositories, create forks, push to your fork, and open pull requests
- At least one configured AI provider: Gemini, OpenAI, or a local Ollama installation with the configured model available

## Run locally

Open two terminals from the repository root.

### 1. Configure the backend

```powershell
cd server
Copy-Item .env.example .env
```

Edit `server/.env` and add your `GITHUB_TOKEN` and whichever AI provider key(s) you use. Never commit real API keys.

Start the backend:

```powershell
npm install
npm run dev
```

The API runs on `http://localhost:5000` by default and binds to `127.0.0.1` for local-only access. `CLIENT_ORIGINS` controls the allowed browser origins; keep it limited to trusted frontend URLs. Set `PORT` or `HOST` only when needed. Do not expose this token-backed API to the public internet without adding user authentication and HTTPS.

### 2. Configure and start the frontend

In a second terminal:

```powershell
cd client
Copy-Item .env.example .env
npm install
npm run dev
```

The frontend uses `VITE_API_BASE_URL` from `client/.env`; it defaults to `http://localhost:5000`.

### 3. Verify the backend

Open `http://localhost:5000/api/health`. A healthy server returns:

```json
{"status":"ok"}
```

## Checks

Run from the repository root:

```powershell
cd client
npm ci
npm run build
npm run lint
cd ../server
npm ci
npm run typecheck
npm test
```

GitHub Actions runs these frontend and backend checks on pushes and pull requests to `main`.

## Safety and current limitations

- The API binds to loopback by default and rejects foreign `Host` headers in loopback mode to reduce DNS-rebinding risk. Do not set `HOST` to a public interface unless you have added real user authentication, HTTPS, and deployment-grade abuse controls.
- Browser CORS is an additional boundary, not authentication. The API uses a local-process limit of 20 AI requests per client IP per 10 minutes to reduce accidental or abusive provider spend; this is not a shared or deployment-grade rate limiter.
- Branch creation and proposal commits are restricted to repositories owned by the authenticated GitHub account and verified as forks. Multi-file proposals are validated together, then written through the Git Data API as one commit with a non-force branch-ref update, so a preparation failure cannot leave half the proposal committed. Pull-request creation only accepts a head branch owned by the authenticated account.
- Commits reject common credential/private-key paths such as `.env`, `.npmrc`, `.pypirc`, `.ssh`, `.aws`, secret/credential directories, and common private-key filenames. This is defense in depth, not a guarantee that arbitrary file contents contain no secrets.
- AI prompts explicitly treat issue text, repository files, source comments, and review feedback as untrusted data. Prompt-injection defenses are best-effort; inspect every proposed diff.
- Review generated file contents before approval. AI output can be wrong even when the reviewer says it is approved.
- Generated code and target-repository checks are never executed inside the API process. An opt-in `/api/sandbox/run` endpoint can run a bounded check in Docker when `SANDBOX_ENABLED=true` and Docker is installed. The runner uses a disposable temporary workspace, no network, a read-only container root, dropped Linux capabilities, no-new-privileges, a non-root UID, PID/memory/CPU limits, a wall-clock timeout, bounded output, and cleanup. This is a first isolation layer, not a hardened multi-tenant execution service.
- The repository CI uses disposable GitHub-hosted runners, read-only repository permissions, checkout without persisted credentials, and job timeouts. This protects this project's own CI; it does not guarantee that an external repository's test infrastructure is safe.
- The first sandbox runner accepts bounded text files and supports fixed Node (`npm test`, `npm run lint`, `npm run build`, `npm run typecheck`) and Python (`unittest`, `compileall`) checks. It does not install dependencies or fetch repositories yet, and the submitted workspace must include the files needed for the selected check. The runner is disabled by default; only enable it for a local trusted deployment after reviewing the threat model. For high-risk repositories, use a disposable VM or stronger container isolation.
- The application commits proposed replacement contents for the files listed in the proposal; it does not execute the target repository's tests or prove the change is correct. External CI results are evidence only when they are actually observed; never assume a test passed.
- Keep secrets in local environment files or GitHub secret storage. Never commit real keys or paste them into issues or generated proposals.
- The first version reads a bounded set of repository source files. Large repositories may need more targeted file retrieval before a proposal is reliable.

## Goal

Help developers make real, reviewable open-source contributions while keeping human approval and pull-request creation under their control.
