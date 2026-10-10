# AI Open Source Engineer

An AI-assisted open-source contribution workflow that discovers issues, analyzes repository source, drafts and reviews concrete file changes, and prepares a contribution in a fork. **A person must approve the contribution, and creating the pull request remains a separate, explicit action.**

## Features

- Discover open GitHub issues labelled `good-first-issue`
- Use AI to select an issue and analyze repository source files
- Generate an implementation plan and proposed file contents
- Review the proposal with an AI reviewer
- After human approval, fork the upstream repository, create a branch, and commit the proposed source files
- Create a pull request against the original repository only when the user clicks **Create Pull Request**
- Retry failed branch and file-commit operations without starting an unbounded request loop

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

- Review generated file contents before approval. AI output can be wrong even when the reviewer says it is approved.
- The application commits the proposed replacement contents for the files listed in the proposal; it does not execute the target repository's tests or prove the change is correct.
- Keep secrets in local environment files or GitHub secret storage. Do not paste them into issues or generated proposals.
- The first version reads a bounded set of repository source files. Large repositories may need more targeted file retrieval before a proposal is reliable.

## Goal

Help developers make real, reviewable open-source contributions while keeping human approval and pull-request creation under their control.
