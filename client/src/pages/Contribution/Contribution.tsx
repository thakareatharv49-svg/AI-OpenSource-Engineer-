const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, { ...init, credentials: "include" });

import { useEffect, useRef, useState } from "react";
import "./Contribution.css";
import ContributionProgress from "../../components/contribution/ContributionProgress";
import { API_BASE_URL } from "../../lib/api";

type GitHubIssue = {
  id: number;
  title: string;
  url: string;
  repository: string;
  user: string;
  createdAt: string;
  updatedAt: string;
};

type AISelection = {
  selectedIssueId: number;
  reason: string;
  difficulty: "Easy" | "Medium" | "Hard";
  confidence: number;
};

type SolutionPlan = {
  [key: string]: unknown;
};

type CodeReview = {
  overallStatus: "Approved" | "Changes Requested" | "Needs More Information";
  summary: string;
  bugs: string[];
  securityIssues: string[];
  codeQualityIssues: string[];
  missingTests: string[];
  suggestions: string[];
  confidence: number;
};

type RepositoryFile = {
  path: string;
  content: string;
};

type SandboxResult = {
  status: "passed" | "failed" | "timed_out" | "cancelled" | "unavailable";
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
  summary: string;
};

type RepositoryAnalysis = {
  summary?: string;
  repositoryOverview?: string;
  relevantFiles?: string[];
  rootCause?: string;
  recommendedApproach?: string;
  risks?: string[];
  [key: string]: unknown;
};

function getRepositoryName(issueUrl: string) {
  const repositoryUrl = issueUrl.split("/issues/")[0];

  return repositoryUrl
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\/$/, "");
}

function Contribution() {
  // Prevent failed automatic stages from launching an unbounded request loop.
  // Each stage can still be retried explicitly from its visible action button.
  const autoRunAttempts = useRef(new Set<string>());
  const [started, setStarted] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowVersion, setWorkflowVersion] = useState<number | null>(null);
  const [workflowState, setWorkflowState] = useState<string | null>(null);
  useEffect(() => {
    if (!started) autoRunAttempts.current.clear();
  }, [started]);
  const [stage, setStage] = useState(0);
  const updateLifecycle = async (nextState: string, message: string) => {
    if (!workflowId || workflowVersion === null) return;
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/lifecycle/${workflowId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: nextState, expectedVersion: workflowVersion, message }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lifecycle update failed");
      setWorkflowVersion(data.contribution.version);
      setWorkflowState(data.contribution.state);
      localStorage.setItem("ai-ose-lifecycle-pointer", JSON.stringify({ id: data.contribution.id, version: data.contribution.version, state: data.contribution.state }));
    } catch (error) { console.warn("Lifecycle update failed:", error); }
  };

  const handleCancelWorkflow = async () => {
    if (!workflowId || workflowVersion === null || workflowState === "commit_complete" || workflowState === "cancelled") return;
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/lifecycle/${workflowId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "cancelled", expectedVersion: workflowVersion, message: "Cancelled by the user" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to cancel contribution workflow");
      setWorkflowVersion(data.contribution.version);
      setWorkflowState("cancelled");
      setStarted(false);
      setStage(0);
      setApproved(false);
      setChangesRequested(false);
      setSelectedIssue(null);
      setAISelection(null);
      setRepositoryAnalysis(null);
      setRepositoryFiles([]);
      setSolutionPlan(null);
      setCodeProposal(null);
      setCodeReview(null);
      setForkedRepository("");
      setBranchName("");
      setCommitSuccess(false);
      localStorage.removeItem("ai-ose-lifecycle-pointer");
    } catch (error) {
      console.warn("Contribution workflow cancellation failed:", error);
    }
  };
  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const raw = localStorage.getItem("ai-ose-lifecycle-pointer");
        if (!raw) return;
        const pointer = JSON.parse(raw) as { id?: unknown };
        if (typeof pointer.id !== "string") return;
        const response = await apiFetch(`${API_BASE_URL}/api/lifecycle/${encodeURIComponent(pointer.id)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !data.contribution) return;
        setWorkflowId(data.contribution.id);
        setWorkflowVersion(data.contribution.version);
        setWorkflowState(data.contribution.state);
      } catch (error) { console.warn("Could not restore saved lifecycle status:", error); }
    };
    void restore();
    return () => { active = false; };
  }, []);
  const [approved, setApproved] = useState(false);
  const [proposalApprovalHash, setProposalApprovalHash] = useState<string | null>(null);
  const [changesRequested, setChangesRequested] = useState(false);

  const [creatingPR, setCreatingPR] = useState(false);
  const [prError, setPrError] = useState("");

  const [pullRequest, setPullRequest] = useState<{
    htmlUrl: string;
    number: number;
  } | null>(null);

  const [branchName, setBranchName] = useState("");
  const [forkingRepository, setForkingRepository] = useState(false);
const [forkError, setForkError] = useState("");
const [forkedRepository, setForkedRepository] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [branchError, setBranchError] = useState("");

  const [committingFile, setCommittingFile] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [commitSuccess, setCommitSuccess] = useState(false);

  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [issueFetchAttempt, setIssueFetchAttempt] = useState(0);

  const [selectedIssue, setSelectedIssue] =
    useState<GitHubIssue | null>(null);

  const [aiSelection, setAISelection] =
    useState<AISelection | null>(null);

  const [selectingIssue, setSelectingIssue] = useState(false);
  const [aiError, setAiError] = useState("");

  const [repositoryAnalysis, setRepositoryAnalysis] =
    useState<RepositoryAnalysis | null>(null);
  const [repositoryFiles, setRepositoryFiles] = useState<RepositoryFile[]>([]);

  const [analyzingRepository, setAnalyzingRepository] =
    useState(false);

  const [repositoryError, setRepositoryError] = useState("");

  const [solutionPlan, setSolutionPlan] =
    useState<SolutionPlan | null>(null);

  const [buildingSolution, setBuildingSolution] = useState(false);
  const [solutionError, setSolutionError] = useState("");

  const [codeProposal, setCodeProposal] =
    useState<Record<string, unknown> | null>(null);

  const [generatingCode, setGeneratingCode] = useState(false);
  const [codeError, setCodeError] = useState("");

  const [codeReview, setCodeReview] =
    useState<CodeReview | null>(null);

  const [reviewingCode, setReviewingCode] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const [sandboxRuntime, setSandboxRuntime] = useState<"node" | "python">("node");
  const [sandboxCheck, setSandboxCheck] = useState<"test" | "lint" | "build" | "typecheck">("test");
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<SandboxResult | null>(null);
  const [sandboxError, setSandboxError] = useState("");
  const sandboxRunId = useRef<string | null>(null);
  const uiSnapshotRestored = useRef(false);

  // The snapshot stays in this browser only; OAuth tokens are never persisted here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ai-ose-contribution-snapshot-v1");
      if (raw && raw.length <= 900_000) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        if (saved.version === 1) {
          if (typeof saved.started === "boolean") setStarted(saved.started);
          if (typeof saved.stage === "number" && Number.isInteger(saved.stage) && saved.stage >= 0 && saved.stage <= 5) setStage(saved.stage);
          if (typeof saved.approved === "boolean") setApproved(saved.approved);
          if (typeof saved.proposalApprovalHash === "string") setProposalApprovalHash(saved.proposalApprovalHash);
          if (typeof saved.changesRequested === "boolean") setChangesRequested(saved.changesRequested);
          if (saved.selectedIssue && typeof saved.selectedIssue === "object") setSelectedIssue(saved.selectedIssue as GitHubIssue);
          if (Array.isArray(saved.issues)) setIssues(saved.issues as GitHubIssue[]);
          if (saved.aiSelection && typeof saved.aiSelection === "object") setAISelection(saved.aiSelection as AISelection);
          if (saved.repositoryAnalysis && typeof saved.repositoryAnalysis === "object") setRepositoryAnalysis(saved.repositoryAnalysis as RepositoryAnalysis);
          if (Array.isArray(saved.repositoryFiles)) setRepositoryFiles(saved.repositoryFiles as RepositoryFile[]);
          if (saved.solutionPlan && typeof saved.solutionPlan === "object") setSolutionPlan(saved.solutionPlan as SolutionPlan);
          if (saved.codeProposal && typeof saved.codeProposal === "object") setCodeProposal(saved.codeProposal as Record<string, unknown>);
          if (saved.codeReview && typeof saved.codeReview === "object") setCodeReview(saved.codeReview as CodeReview);
          if (typeof saved.forkedRepository === "string") setForkedRepository(saved.forkedRepository);
          if (typeof saved.branchName === "string") setBranchName(saved.branchName);
          if (typeof saved.baseBranch === "string") setBaseBranch(saved.baseBranch);
          if (typeof saved.commitSuccess === "boolean") setCommitSuccess(saved.commitSuccess);
          if (typeof saved.workflowId === "string") setWorkflowId(saved.workflowId);
          if (typeof saved.workflowVersion === "number") setWorkflowVersion(saved.workflowVersion);
          if (typeof saved.workflowState === "string") setWorkflowState(saved.workflowState);
        }
      }
    } catch (error) {
      console.warn("Saved contribution UI state could not be restored:", error);
    } finally {
      uiSnapshotRestored.current = true;
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!uiSnapshotRestored.current) return;
    try {
      const snapshot = {
        version: 1, started, stage, approved, proposalApprovalHash, changesRequested, selectedIssue, issues, aiSelection,
        repositoryAnalysis, repositoryFiles, solutionPlan, codeProposal, codeReview, forkedRepository,
        branchName, baseBranch, commitSuccess, workflowId, workflowVersion, workflowState,
      };
      const serialized = JSON.stringify(snapshot);
      if (serialized.length <= 900_000) localStorage.setItem("ai-ose-contribution-snapshot-v1", serialized);
    } catch (error) {
      console.warn("Contribution UI state could not be saved locally:", error);
    }
  }, [started, stage, approved, proposalApprovalHash, changesRequested, selectedIssue, issues, aiSelection, repositoryAnalysis,
      repositoryFiles, solutionPlan, codeProposal, codeReview, forkedRepository, branchName, baseBranch,
      commitSuccess, workflowId, workflowVersion, workflowState]);

  useEffect(() => {
    if (!started || stage !== 0) return;

    const fetchIssues = async () => {
      setLoadingIssues(true);
      setIssueError("");

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/github/issues`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch GitHub issues");
        }

        const data = await response.json();
        setIssues(data.issues);
      } catch (error) {
        console.error("Failed to fetch issues:", error);
        setIssueError("Unable to fetch GitHub issues.");
      } finally {
        setLoadingIssues(false);
      }
    };

    fetchIssues();
  }, [started, stage, issueFetchAttempt]);
    
    

  const handleAISelection = async () => {
    if (issues.length === 0) return;

    setSelectingIssue(true);
    setAiError("");

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/ai/select-issue`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            issues,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI selection failed");
      }

      const selection: AISelection = data.result;

      const issue = issues.find(
        (item) => item.id === selection.selectedIssueId
      );

      if (!issue) {
        throw new Error("AI selected an issue that was not found");
      }

      const lifecycleResponse = await apiFetch(`${API_BASE_URL}/api/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: `issue-${issue.id}-${crypto.randomUUID()}`, issueUrl: issue.url, repository: getRepositoryName(issue.url) }) });
      const lifecycleData = await lifecycleResponse.json();
      if (!lifecycleResponse.ok) throw new Error(lifecycleData.error || "Could not save contribution workflow state.");
      setWorkflowId(lifecycleData.contribution.id);
      setWorkflowVersion(lifecycleData.contribution.version);
      setWorkflowState(lifecycleData.contribution.state);
      try { localStorage.setItem("ai-ose-lifecycle-pointer", JSON.stringify({ id: lifecycleData.contribution.id, version: lifecycleData.contribution.version, state: lifecycleData.contribution.state })); } catch { /* lifecycle remains on the server if browser storage is unavailable */ }
      setAISelection(selection);
      setSelectedIssue(issue);
    } catch (error) {
      console.error("AI selection error:", error);

      setAiError(
        error instanceof Error
          ? error.message
          : "Failed to select an issue using AI."
      );
    } finally {
      setSelectingIssue(false);
    }
  };

  const handleRepositoryAnalysis = async () => {
    if (!selectedIssue) return;

    setAnalyzingRepository(true);
    setRepositoryError("");
    await updateLifecycle("analyzing", "Repository analysis started");

    try {
      const repository = getRepositoryName(selectedIssue.url);

      const response = await apiFetch(
        `${API_BASE_URL}/api/ai/analyze-repository`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository,
            issue: selectedIssue,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Repository analysis failed"
        );
      }

      await updateLifecycle("planning", "Repository analysis completed");
      setRepositoryAnalysis(data.result);
      setRepositoryFiles(Array.isArray(data.files) ? data.files : []);
      setStage(1);
    } catch (error) {
      console.error("Repository analysis error:", error);

      setRepositoryError(
        error instanceof Error
          ? error.message
          : "Failed to analyze repository."
      );
    } finally {
      setAnalyzingRepository(false);
    }
  };
  


  const handleBuildSolution = async () => {
    if (!selectedIssue || !repositoryAnalysis) return;

    setBuildingSolution(true);
    setSolutionError("");

    try {
      const repository = getRepositoryName(selectedIssue.url);

      const response = await apiFetch(
        `${API_BASE_URL}/api/ai/build-solution`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository,
            issue: selectedIssue,
            repositoryAnalysis,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Building solution failed");
      }

      setSolutionPlan(data.result);
      setStage(2);
    } catch (error) {
      console.error("Build solution error:", error);

      setSolutionError(
        error instanceof Error
          ? error.message
          : "Failed to build the solution."
      );
    } finally {
      setBuildingSolution(false);
    }
  };

  const handleGenerateCode = async () => {
    if (!selectedIssue || !repositoryAnalysis || !solutionPlan) {
      return;
    }

    setGeneratingCode(true);
    setCodeError("");

    try {
      const repository = getRepositoryName(selectedIssue.url);

      const response = await apiFetch(
        `${API_BASE_URL}/api/ai/generate-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository,
            issue: selectedIssue,
            repositoryAnalysis,
            solutionPlan,
            files: repositoryFiles,
            reviewFeedback: changesRequested && codeReview
              ? {
                  summary: codeReview.summary,
                  bugs: codeReview.bugs,
                  securityIssues: codeReview.securityIssues,
                  codeQualityIssues: codeReview.codeQualityIssues,
                  missingTests: codeReview.missingTests,
                  suggestions: codeReview.suggestions,
                }
              : null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Code generation failed");
      }

      await updateLifecycle("proposal_ready", "Code proposal generated");
      setCodeProposal(data.result);
      setCodeReview(null);
      setProposalApprovalHash(null);
      setApproved(false);
      setChangesRequested(false);
      autoRunAttempts.current.delete("review-code");
      setStage(3);
    } catch (error) {
      console.error("Code generation error:", error);

      setCodeError(
        error instanceof Error
          ? error.message
          : "Failed to generate code proposal."
      );
    } finally {
      setGeneratingCode(false);
    }
  };
  const handleReviewCode = async () => {
    if (!selectedIssue || !codeProposal) return;

    setReviewingCode(true);
    setReviewError("");
    await updateLifecycle("review_pending", "AI code review started");

    try {
      const repository = getRepositoryName(selectedIssue.url);

      const response = await apiFetch(
        `${API_BASE_URL}/api/ai/review-code`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository,
            issue: selectedIssue,
            codeProposal,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Code review failed");
      }

      const review = data.result as Partial<CodeReview> | undefined;
      const allowedStatuses = [
        "Approved",
        "Changes Requested",
        "Needs More Information",
      ] as const;
      const overallStatus: CodeReview["overallStatus"] =
        allowedStatuses.includes(String(review?.overallStatus) as typeof allowedStatuses[number])
          ? (review?.overallStatus as CodeReview["overallStatus"])
          : "Needs More Information";
      const stringList = (value: unknown): string[] =>
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [];

      await updateLifecycle(overallStatus === "Approved" ? "awaiting_approval" : "proposal_ready", overallStatus === "Approved" ? "AI review passed; waiting for human approval" : "AI review requests changes");
      setCodeReview({
        overallStatus,
        summary:
          typeof review?.summary === "string"
            ? review.summary
            : "The AI response did not include a review summary.",
        bugs: stringList(review?.bugs),
        securityIssues: stringList(review?.securityIssues),
        codeQualityIssues: stringList(review?.codeQualityIssues),
        missingTests: stringList(review?.missingTests),
        suggestions: stringList(review?.suggestions),
        confidence:
          typeof review?.confidence === "number" && Number.isFinite(review.confidence)
            ? Math.min(100, Math.max(0, Math.round(review.confidence)))
            : 0,
      });
    } catch (error) {
      console.error("Code review error:", error);

      setReviewError(
        error instanceof Error
          ? error.message
          : "Failed to review code."
      );
    } finally {
      setReviewingCode(false);
    }
  };

  const handleRunSandboxCheck = async () => {
    if (!codeProposal) return;
    if (!selectedIssue) {
      setSandboxError("Select an issue before preparing a repository snapshot.");
      return;
    }

    let runId: string | null = null;
    setSandboxError("");
    setSandboxResult(null);
    try {
      const repository = getRepositoryName(selectedIssue.url);
      const snapshotResponse = await apiFetch(`${API_BASE_URL}/api/sandbox/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository }),
      });
      const snapshotData = await snapshotResponse.json();
      if (!snapshotResponse.ok) throw new Error(snapshotData.error || "Repository snapshot preparation failed.");

      const snapshot = new Map<string, string>();
      for (const file of snapshotData.files as RepositoryFile[]) {
        if (file && typeof file.path === "string" && typeof file.content === "string") {
          snapshot.set(file.path, file.content);
        }
      }
      const changes = Array.isArray(codeProposal.changes) ? codeProposal.changes : [];
      for (const change of changes) {
        if (!change || typeof change !== "object") continue;
        const item = change as Record<string, unknown>;
        if (typeof item.file !== "string" || typeof item.after !== "string") continue;
        const lines = item.after.split("\n");
        if (lines[0]?.trim().startsWith("```")) lines.shift();
        if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
        snapshot.set(item.file.trim(), lines.join("\n"));
      }
      const files = Array.from(snapshot, ([path, content]) => ({ path, content }));
      if (files.length === 0) throw new Error("No eligible repository files or proposed changes are available to test.");

      runId = crypto.randomUUID();
      sandboxRunId.current = runId;
      setSandboxRunning(true);
      const response = await apiFetch(`${API_BASE_URL}/api/sandbox/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, runtime: sandboxRuntime, check: sandboxCheck, timeoutMs: 60000, files }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Isolated check could not start.");
      setSandboxResult(data as SandboxResult);
    } catch (error) {
      setSandboxError(error instanceof Error ? error.message : "Isolated check failed.");
    } finally {
      if (runId && sandboxRunId.current === runId) sandboxRunId.current = null;
      setSandboxRunning(false);
    }
  };

  const handleCancelSandboxCheck = async () => {
    const runId = sandboxRunId.current;
    if (!runId) return;
    setSandboxError("");
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sandbox/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Cancellation request failed.");
    } catch (error) {
      setSandboxError(error instanceof Error ? error.message : "Cancellation request failed.");
    }
  };

  const handleForkRepository = async () => {
  if (!selectedIssue) {
    setForkError("No issue selected.");
    return;
  }

  setForkingRepository(true);
  setForkError("");
  await updateLifecycle("fork_pending", "Fork operation started");

  try {
    const repository = getRepositoryName(selectedIssue.url);
    const [owner, repo] = repository.split("/");

    const response = await apiFetch(
      `${API_BASE_URL}/api/github/fork`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner,
          repo,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Failed to fork repository."
      );
    }

    await updateLifecycle("fork_ready", "Fork verified and ready");
    setForkedRepository(data.repository.fullName);
  } catch (error) {
    await updateLifecycle("retryable", error instanceof Error ? error.message : "Fork operation failed");
    setForkError(
      error instanceof Error
        ? error.message
        : "Failed to fork repository."
    );
  } finally {
    setForkingRepository(false);
  }
};

  const handleCreateBranch = async () => {
    if (!selectedIssue) return;

    setCreatingBranch(true);
    setBranchError("");

    try {
      const repository = forkedRepository;
      if (!repository) {
  setBranchError("Please fork the repository first.");
  return;
}
      const [owner, repo] = repository.split("/");

      if (!owner || !repo) {
        throw new Error("Invalid GitHub repository.");
      }

      const repositoryResponse = await apiFetch(
        `${API_BASE_URL}/api/github/repository/${owner}/${repo}`
      );

      const repositoryData = await repositoryResponse.json();

      if (!repositoryResponse.ok) {
        throw new Error(
          repositoryData.error ||
            "Failed to fetch repository information."
        );
      }

      const baseBranch = repositoryData.repository.defaultBranch;
      setBaseBranch(baseBranch);
      const newBranchName = `ai-contribution-${Date.now()}`;

      const response = await apiFetch(
        `${API_BASE_URL}/api/github/branch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            owner,
            repo,
            branchName: newBranchName,
            baseBranch,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Branch creation failed."
        );
      }

      await updateLifecycle("branch_ready", "Contribution branch created");
      setBranchName(newBranchName);

      console.log("Branch created successfully:", data);
    } catch (error) {
      console.error("Branch creation error:", error);

      setBranchError(
        error instanceof Error
          ? error.message
          : "Failed to create GitHub branch."
      );
    } finally {
      setCreatingBranch(false);
    }
  };
  const handleApproveContribution = async () => {
    if (!workflowId || workflowVersion === null || !selectedIssue || !codeProposal) { setForkError("The workflow, selected issue, and proposal are required before approval."); return; }
    const sourceChanges = Array.isArray(codeProposal.changes) ? codeProposal.changes : [];
    const changes: Array<{ filePath: string; content: string }> = [];
    for (const raw of sourceChanges) {
      if (!raw || typeof raw !== "object") { setForkError("The proposal contains an invalid change."); return; }
      const item = raw as Record<string, unknown>;
      const filePath = typeof item.file === "string" ? item.file.trim() : "";
      let content = typeof item.after === "string" ? item.after : "";
      const lines = content.split("\n");
      if (lines[0]?.trim().startsWith("```")) lines.shift();
      if (lines[lines.length - 1]?.trim() === "```") lines.pop();
      content = lines.join("\n");
      if (!filePath || !content.trim()) { setForkError("The proposal contains an empty or invalid file change."); return; }
      changes.push({ filePath, content });
    }
    if (!changes.length) { setForkError("There are no concrete file changes to approve."); return; }
    const commitMessage = "AI contribution: " + (selectedIssue.title || "implement proposed fix");
    setForkError("");
    try {
      const response = await apiFetch(API_BASE_URL + "/api/lifecycle/" + encodeURIComponent(workflowId) + "/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: workflowVersion, commitMessage, changes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Server could not record human approval.");
      setProposalApprovalHash(data.proposalHash);
      setWorkflowVersion(data.contribution.version); setWorkflowState(data.contribution.state);
      localStorage.setItem("ai-ose-lifecycle-pointer", JSON.stringify({ id: data.contribution.id, version: data.contribution.version, state: data.contribution.state }));
      setApproved(true); await handleForkRepository();
    } catch (error) {
      setApproved(false); setProposalApprovalHash(null);
      setForkError(error instanceof Error ? error.message : "Could not record human approval.");
    }
  };
  const handleCommitFile = async () => {
    if (!branchName || !forkedRepository || !codeProposal) {
      setCommitError("A fork, branch, and reviewed code proposal are required.");
      return;
    }

    const changes = codeProposal.changes;
    if (!Array.isArray(changes) || changes.length === 0) {
      setCommitError("The proposal contains no concrete file changes. Request a new code proposal before committing.");
      return;
    }

    const normalizedChanges: Array<{ filePath: string; content: string }> = [];
    for (const change of changes) {
      if (!change || typeof change !== "object") {
        setCommitError("The proposal contains an invalid file change.");
        return;
      }

      const item = change as Record<string, unknown>;
      const filePath = typeof item.file === "string" ? item.file.trim() : "";
      let content = typeof item.after === "string" ? item.after : "";
      const contentLines = content.split("\n");
      if (contentLines[0]?.trim().startsWith("```")) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.trim() === "```") {
        contentLines.pop();
      }
      content = contentLines.join("\n");
      const segments = filePath.split("/");
      const unsafePath =
        !filePath ||
        filePath.startsWith("/") ||
        filePath.includes("\\") ||
        segments.some((segment) => !segment || segment === "." || segment === "..") ||
        filePath.startsWith(".git/") ||
        /(^|\/)\.env(?:\.|$)/i.test(filePath);

      if (unsafePath) {
        setCommitError("The proposal contains an unsafe or invalid file path: " + filePath);
        return;
      }
      if (!content.trim() || /(^|\n)\s*(?:\.\.\.|TODO:\s*implement|implementation goes here|insert code here)\s*(?:\n|$)/i.test(content)) {
        setCommitError("The proposal for " + filePath + " is empty or contains an obvious placeholder.");
        return;
      }
      normalizedChanges.push({ filePath, content });
    }

    setCommittingFile(true);
    setCommitError("");
    setCommitSuccess(false);
    await updateLifecycle("commit_preparing", "Preparing atomic proposal commit");

    try {
      const parts = forkedRepository.split("/");
      const [owner, repo] = parts;
      if (!owner || !repo) {
        throw new Error("The fork repository name is invalid.");
      }

      // The server validates the entire proposal and writes one Git commit.
      // This prevents a failed multi-file proposal from leaving partial commits.
      const response = await apiFetch(`${API_BASE_URL}/api/github/commit-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branchName,
          commitMessage: "AI contribution: " + (selectedIssue?.title ?? "implement proposed fix"),
          changes: normalizedChanges,
          workflowId,
          proposalHash: proposalApprovalHash,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const fileContext = typeof data.failedFile === "string" ? ` (file: ${data.failedFile})` : "";
        const recovery = data.branchUnchanged === true
          ? " The branch was not updated; you can safely retry after resolving the error."
          : "";
        throw new Error((data.error || "Failed to commit the proposal.") + fileContext + recovery);
      }

      await updateLifecycle("commit_complete", "Approved proposal committed atomically");
      setCommitSuccess(true);
    } catch (error) {
      await updateLifecycle("retryable", error instanceof Error ? error.message : "Proposal commit failed");
      setCommitError(
        error instanceof Error ? error.message : "Failed to commit proposed changes."
      );
    } finally {
      setCommittingFile(false);
    }
  };

  const handleCreatePullRequest = async () => {
  if (!selectedIssue || !forkedRepository) {
    setPrError("The selected issue and fork are required before creating a pull request.");
    return;
  }

  if (!branchName || !commitSuccess || !approved) {
    setPrError("Approve the contribution and commit the proposal before creating a pull request.");
    return;
  }

  setCreatingPR(true);
  setPrError("");

  try {
    const response = await apiFetch(
      `${API_BASE_URL}/api/github/pull-request`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner: getRepositoryName(selectedIssue?.url ?? "").split("/")[0],
          repo: getRepositoryName(selectedIssue?.url ?? "").split("/")[1],
          headBranch: forkedRepository.split("/")[0] + ":" + branchName,
          headRepository: forkedRepository.split("/")[1],
          baseBranch,
          workflowId,
          proposalHash: proposalApprovalHash,
          title: "AI Contribution: " + (selectedIssue?.title ?? "Proposed fix"),
          body: [
            "This pull request was prepared by AI Open Source Engineer.",
            "",
            "Closes #" + (selectedIssue?.url.split("/").pop() ?? ""),
            "",
            "Please review the proposed changes and run the repository test suite before merging.",
          ].join("\n"),
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Failed to create pull request."
      );
    }

    setPullRequest({
      htmlUrl: data.pullRequest.htmlUrl,
      number: data.pullRequest.number,
    });
  } catch (error) {
    setPrError(
      error instanceof Error
        ? error.message
        : "Failed to create pull request."
    );
  } finally {
    setCreatingPR(false);
  }
};

useEffect(() => {
    if (
      started &&
      stage === 0 &&
      issues.length > 0 &&
      !selectedIssue &&
      !selectingIssue &&
      !autoRunAttempts.current.has("select-issue")
    ) {
      autoRunAttempts.current.add("select-issue");
      void handleAISelection();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    started,
    stage,
    issues,
    selectedIssue,
    selectingIssue,
  ]);

useEffect(() => {
    if (
      started &&
      stage === 0 &&
      selectedIssue &&
      aiSelection
    ) {
      void Promise.resolve().then(() => handleRepositoryAnalysis());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, stage, selectedIssue, aiSelection]);

useEffect(() => {
  if (
    started &&
    stage === 1 &&
    repositoryAnalysis &&
    !buildingSolution &&
    !autoRunAttempts.current.has("build-solution")
  ) {
    autoRunAttempts.current.add("build-solution");
    void handleBuildSolution();
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [started, stage, repositoryAnalysis, buildingSolution]);

useEffect(() => {
  if (
    started &&
    stage === 2 &&
    solutionPlan &&
    !generatingCode &&
    !autoRunAttempts.current.has("generate-code")
  ) {
    autoRunAttempts.current.add("generate-code");
    void handleGenerateCode();
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [started, stage, solutionPlan, generatingCode]);

useEffect(() => {
  if (
    started &&
    stage === 3 &&
    codeProposal &&
    !codeReview &&
    !reviewingCode &&
    !autoRunAttempts.current.has("review-code")
  ) {
    autoRunAttempts.current.add("review-code");
    void handleReviewCode();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [
  started,
  stage,
  codeProposal,
  codeReview,
  reviewingCode,
]);

  const stages = [
    {
      title: "Finding an Issue...",
      description:
        "AI is searching GitHub for an open-source issue that can be solved automatically.",
      step: "01",
      name: "Finding Issue",
      detail: "Searching GitHub for suitable open-source issues...",
    },
    {
      title: "Analyzing Repository...",
      description:
        "AI found the best issue and is now understanding the repository.",
      step: "02",
      name: "Analyzing Repository",
      detail:
        "Understanding the project structure and relevant files...",
    },
    {
      title: "Building Solution...",
      description:
        "AI is planning and implementing the solution for the selected issue.",
      step: "03",
      name: "Build Solution",
      detail: "Writing and modifying the required code...",
    },
    {
      title: "Reviewing Code Proposal...",
      description:
        "AI generated a proposed solution. Review the changes before final verification.",
      step: "04",
      name: "Review Code Proposal",
      detail:
        "Inspect the generated code proposal before final approval...",
    },
    {
      title: "Ready for Review",
      description:
        "The AI has completed the contribution and prepared it for your final verification.",
      step: "05",
      name: "Your Review",
      detail:
        "Review the changes before creating the pull request.",
    },
  ];
  useEffect(() => {
    if (
      approved &&
      forkedRepository &&
      !branchName &&
      !creatingBranch &&
      !branchError &&
      !autoRunAttempts.current.has("create-branch")
    ) {
      autoRunAttempts.current.add("create-branch");
      void handleCreateBranch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    approved,
    forkedRepository,
    branchName,
    creatingBranch,
    branchError,
  ]);

  useEffect(() => {
    if (
      approved &&
      branchName &&
      !commitSuccess &&
      !committingFile &&
      !commitError &&
      !autoRunAttempts.current.has("commit-proposal")
    ) {
      autoRunAttempts.current.add("commit-proposal");
      void handleCommitFile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    approved,
    branchName,
    commitSuccess,
    committingFile,
    commitError,
  ]);


  return (
    <main className="contribution-page">
      <div className="contribution-container">
        {workflowState && <div role="status" aria-live="polite"><p>Saved contribution lifecycle state: {workflowState}. Refreshing this page preserves the server-side progress record.</p>{workflowState !== "commit_complete" && workflowState !== "cancelled" && <button className="contribution-start-button" onClick={() => void handleCancelWorkflow()}>Cancel Workflow</button>}</div>}
        <span className="contribution-label">
          AI OPEN SOURCE ENGINEER
        </span>

        {!started ? (
          <>
            <h1>Start Your Contribution</h1>

            <p>
              Let AI find an open-source opportunity, understand the
              repository, build the solution, test the changes, and
              prepare everything for your final review.
            </p>

            <div className="contribution-workflow">
              {stages.map((item) => (
                <div className="workflow-step" key={item.step}>
                  <span className="workflow-number">
                    {item.step}
                  </span>

                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="contribution-start-button"
              onClick={() => setStarted(true)}
            >
              Start AI Contribution
            </button>
          </>
        ) : (approved && commitSuccess) ? (
          <>
            <h1>Contribution Approved 🎉</h1>

            <p>
              Your contribution has been verified and is ready to be
              submitted as a pull request.
            </p>

            <div className="workflow-step">
              <span className="workflow-number">✓</span>

              <div>
                <h3>Ready to Create Pull Request</h3>

                <p>
                  The AI completed the workflow and you approved the
                  changes.
                </p>
                <button
  className="contribution-start-button"
  onClick={handleCreatePullRequest}
  disabled={creatingPR || !branchName}
>
  {creatingPR
    ? "Creating Pull Request..."
    : "Create Pull Request"}
</button>

{prError && <p>{prError}</p>}

{pullRequest && (
  <p>
    Pull request created successfully! ✅{" "}
    <a
      href={pullRequest.htmlUrl}
      target="_blank"
      rel="noreferrer"
    >
      View Pull Request #{pullRequest.number} →
    </a>
  </p>
)}
              </div>
            </div>
          </>
        ) : (
          <>
            <h1>{stages[stage].title}</h1>

            <p>{stages[stage].description}</p>

            <ContributionProgress currentStage={stage} />

            {stage === 0 && (
              <div className="issue-results">
                {loadingIssues && (
                  <p>Finding real GitHub issues...</p>
                )}

                {issueError && (
                  <div role="alert">
                    <p>{issueError}</p>
                    <button
                      className="contribution-start-button"
                      onClick={() => setIssueFetchAttempt((attempt) => attempt + 1)}
                      disabled={loadingIssues}
                    >
                      Retry Issue Search
                    </button>
                  </div>
                )}

                {!loadingIssues &&
                  !issueError &&
                  issues.length > 0 &&
                  !selectedIssue && (
                    <>
                      <h2>Issues Found</h2>

                      <p>
                        GitHub found {issues.length} suitable open
                        issues.
                      </p>

                      <button
                        className="contribution-start-button"
                        onClick={handleAISelection}
                        disabled={selectingIssue}
                      >
                        {selectingIssue
                          ? "AI Is Choosing..."
                          : "Let AI Choose the Best Issue"}
                      </button>

                      {aiError && <p>{aiError}</p>}
                    </>
                  )}

                {selectedIssue && aiSelection && (
                  <div className="workflow-step">
                    <div>
                      <h2>AI Selected This Issue</h2>

                      <h3>{selectedIssue.title}</h3>

                      <p>
                        Reported by @{selectedIssue.user}
                      </p>

                      <p>
                        <strong>Difficulty:</strong>{" "}
                        {aiSelection.difficulty}
                      </p>

                      <p>
                        <strong>Confidence:</strong>{" "}
                        {Math.round(
                          aiSelection.confidence * 100
                        )}
                        %
                      </p>

                      <p>
                        <strong>AI Reason:</strong>{" "}
                        {aiSelection.reason}
                      </p>

                      <a
                        href={selectedIssue.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View Selected Issue →
                      </a>

                      <br />
                      <br />

                      <button
                        className="contribution-start-button"
                        onClick={handleRepositoryAnalysis}
                        disabled={analyzingRepository}
                      >
                        {analyzingRepository
                          ? "Analyzing Repository..."
                          : "Analyze Repository"}
                      </button>

                      {repositoryError && (
                        <p>{repositoryError}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {stage === 1 && (
              <div className="workflow-step">
                <span className="workflow-number">
                  {stages[stage].step}
                </span>

                <div>
                  <h2>Repository Analysis</h2>

                  {repositoryAnalysis ? (
                    <div>
                      {Object.entries(repositoryAnalysis).map(
                        ([key, value]) => (
                          <div key={key}>
                            <h3>
                              {key
                                .replace(/([A-Z])/g, " $1")
                                .replace(/^./, (char) =>
                                  char.toUpperCase()
                                )}
                            </h3>

                            {Array.isArray(value) ? (
                              <ul>
                                {value.map((item, index) => (
                                  <li key={index}>
                                    {typeof item === "object" &&
                                    item !== null
                                      ? JSON.stringify(
                                          item,
                                          null,
                                          2
                                        )
                                      : String(item)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p>{String(value)}</p>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p>
                      Repository analysis is not available yet.
                    </p>
                  )}

                  <br />

                  <button
                    className="contribution-start-button"
                    onClick={handleBuildSolution}
                    disabled={buildingSolution}
                  >
                    {buildingSolution
                      ? "Building Solution..."
                      : "Build Solution"}
                  </button>

                  {solutionError && <p>{solutionError}</p>}
                </div>
              </div>
            )}

            {stage === 2 && solutionPlan && (
              <div className="workflow-step">
                <span className="workflow-number">
                  {stages[stage].step}
                </span>

                <div>
                  <h2>Solution Plan</h2>

                  {Object.entries(solutionPlan).map(
                    ([key, value]) => (
                      <div key={key}>
                        <h3>
                          {key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (char) =>
                              char.toUpperCase()
                            )}
                        </h3>

                        {Array.isArray(value) ? (
                          <ul>
                            {value.map((item, index) => (
                              <li key={index}>
                                {typeof item === "object" &&
                                item !== null
                                  ? JSON.stringify(
                                      item,
                                      null,
                                      2
                                    )
                                  : String(item)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>{String(value)}</p>
                        )}
                      </div>
                    )
                  )}

                  <br />

                  <button
                    className="contribution-start-button"
                    onClick={handleGenerateCode}
                    disabled={generatingCode}
                  >
                    {generatingCode
                      ? "Generating Code..."
                      : changesRequested
                        ? "Regenerate Proposal Using Review Feedback"
                        : "Generate Code"}
                  </button>

                  {codeError && <p>{codeError}</p>}
                </div>
              </div>
            )}

            {stage === 3 && codeProposal && (
              <div className="workflow-step">
                <span className="workflow-number">
                  {stages[stage].step}
                </span>

                <div>
                  <h2>Code Proposal</h2>

                  {Object.entries(codeProposal).map(
                    ([key, value]) => (
                      <div key={key}>
                        <h3>
                          {key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (char) =>
                              char.toUpperCase()
                            )}
                        </h3>

                        {Array.isArray(value) ? (
                          <ul>
                            {value.map((item, index) => (
                              <li key={index}>
                                {typeof item === "object" &&
                                item !== null
                                  ? JSON.stringify(
                                      item,
                                      null,
                                      2
                                    )
                                  : String(item)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>
                            {typeof value === "object" &&
                            value !== null
                              ? JSON.stringify(value, null, 2)
                              : String(value)}
                          </p>
                        )}
                      </div>
                    )
                  )}

                  <br />

                  <button
                    className="contribution-start-button"
                    onClick={handleReviewCode}
                    disabled={reviewingCode}
                  >
                    {reviewingCode
                      ? "Reviewing Code..."
                      : "Run AI Code Review"}
                  </button>

                  {reviewError && <p>{reviewError}</p>}

                  <section aria-labelledby="sandbox-check-heading">
                    <h3 id="sandbox-check-heading">Isolated Test Check</h3>
                    <p>Run a fixed check against the current repository snapshot plus your proposed changes. Docker must be running and SANDBOX_ENABLED=true on the backend. Checks run without network access; dependencies are not installed automatically.</p>
                    <label>
                      Runtime{" "}
                      <select value={sandboxRuntime} onChange={(event) => setSandboxRuntime(event.target.value as "node" | "python")} disabled={sandboxRunning}>
                        <option value="node">Node.js</option>
                        <option value="python">Python</option>
                      </select>
                    </label>{" "}
                    <label>
                      Check{" "}
                      <select value={sandboxCheck} onChange={(event) => setSandboxCheck(event.target.value as "test" | "lint" | "build" | "typecheck")} disabled={sandboxRunning}>
                        <option value="test">Tests</option>
                        <option value="lint">Lint / syntax</option>
                        <option value="build">Build / syntax</option>
                        <option value="typecheck">Typecheck / syntax</option>
                      </select>
                    </label>{" "}
                    <button className="contribution-start-button" onClick={() => void handleRunSandboxCheck()} disabled={sandboxRunning}>
                      {sandboxRunning ? "Running Isolated Check..." : "Run Isolated Check"}
                    </button>{" "}
                    {sandboxRunning && <button className="contribution-start-button" onClick={() => void handleCancelSandboxCheck()}>Cancel Check</button>}
                    {sandboxError && <p role="alert">{sandboxError}</p>}
                    {sandboxResult && (
                      <div role="status" aria-live="polite">
                        <h4>Result: {sandboxResult.status}</h4>
                        <p>{sandboxResult.summary} Duration: {sandboxResult.durationMs} ms.</p>
                        {sandboxResult.outputTruncated && <p>Output was truncated to the configured limit.</p>}
                        {sandboxResult.stdout && <details><summary>Standard output</summary><pre>{sandboxResult.stdout}</pre></details>}
                        {sandboxResult.stderr && <details><summary>Standard error</summary><pre>{sandboxResult.stderr}</pre></details>}
                      </div>
                    )}
                  </section>

                  {codeReview && (
                    <div className="code-review-results">
                      {changesRequested && (
  <p className="changes-requested-message">
    Changes requested. Regenerate the proposal using the review feedback before approval.
  </p>
)}

<h2>AI Code Review Results</h2>

                      <h3>Status</h3>
                      <p>{codeReview.overallStatus}</p>

                      <h3>Summary</h3>
                      <p>{codeReview.summary}</p>

                      <h3>Potential Bugs</h3>
                      <ul>
                        {codeReview.bugs.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>

                      <h3>Security Issues</h3>
                      <ul>
                        {codeReview.securityIssues.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>

                      <h3>Code Quality Issues</h3>
                      <ul>
                        {codeReview.codeQualityIssues.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>

                      <h3>Missing Tests</h3>
                      <ul>
                        {codeReview.missingTests.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>

                      <h3>Suggestions</h3>
                      <ul>
                        {codeReview.suggestions.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>

                      <h3>Confidence</h3>
                      <p>{codeReview.confidence}%</p>
                    </div>
                  )}
                  <button
                    className="contribution-start-button"
                    onClick={() => setStage(4)}
                    disabled={!codeReview || reviewingCode}
                  >
                    Continue to Final Review
                  </button>
                </div>
              </div>
            )}

            {stage > 3 && (
              <div className="workflow-step">
                <span className="workflow-number">
                  {stages[stage].step}
                </span>

                <div>
                  <h3>{stages[stage].name}</h3>
                  <p>{stages[stage].detail}</p>
                </div>
              </div>
            )}

                        {stage === 4 && (
              <div className="review-actions">
                <h2>Final Review</h2>
                <p>
                  Review the AI-generated contribution carefully before approving it.
                </p>

                {codeReview && (
                  <div className="code-review-results">
                    <h3>AI Review Status</h3>
                    <p>{codeReview.overallStatus}</p>
                    <h3>Summary</h3>
                    <p>{codeReview.summary}</p>
                  </div>
                )}

                {!approved && (
                  <div className="contribution-action-buttons">
                    <button
                      className="contribution-start-button"
                      onClick={() => { void handleApproveContribution(); }}
                      disabled={
                        forkingRepository ||
                        !codeReview ||
                        codeReview.overallStatus !== "Approved"
                      }
                      title={
                        codeReview?.overallStatus !== "Approved"
                          ? "The AI review must approve the proposal before it can be committed."
                          : undefined
                      }
                    >
                      {forkingRepository
                        ? "Forking Repository..."
                        : "Approve Contribution"}
                    </button>
                    {codeReview?.overallStatus !== "Approved" && (
                      <p role="status">
                        Resolve the review findings and regenerate the proposal before approval.
                      </p>
                    )}

                    <button
                      className="contribution-start-button"
                      onClick={() => {
                        setChangesRequested(true);
                        setApproved(false);
                        setStage(3);
                      }}
                    >
                      Request Changes
                    </button>
                  </div>
                )}

                {forkError && (
                  <div role="alert">
                    <p>{forkError}</p>
                    <button
                      className="contribution-start-button"
                      onClick={() => void handleForkRepository()}
                      disabled={forkingRepository}
                    >
                      {forkingRepository ? "Forking Repository..." : "Retry Fork"}
                    </button>
                  </div>
                )}

                {forkedRepository && (
                  <p>
                    Repository forked successfully! ✅
                    <br />
                    Fork: {forkedRepository}
                  </p>
                )}

                {branchError && (
                  <div role="alert">
                    <p>{branchError}</p>
                    <button
                      className="contribution-start-button"
                      onClick={() => {
                        autoRunAttempts.current.delete("create-branch");
                        setBranchError("");
                      }}
                      disabled={creatingBranch}
                    >
                      Retry Branch Creation
                    </button>
                  </div>
                )}

                {branchName && <p>Branch created: {branchName}</p>}

                {commitError && (
                  <div role="alert">
                    <p>{commitError}</p>
                    <button
                      className="contribution-start-button"
                      onClick={() => {
                        autoRunAttempts.current.delete("commit-proposal");
                        setCommitError("");
                      }}
                      disabled={committingFile}
                    >
                      Retry Proposal Commit
                    </button>
                  </div>
                )}

                {committingFile && <p>Committing AI proposal...</p>}

                {commitSuccess && (
                  <p>AI proposal committed successfully! ✅</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default Contribution;






