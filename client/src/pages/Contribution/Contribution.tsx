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
  useEffect(() => {
    if (!started) autoRunAttempts.current.clear();
  }, [started]);
  const [stage, setStage] = useState(0);
  const [approved, setApproved] = useState(false);
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

  useEffect(() => {
    if (!started || stage !== 0) return;

    const fetchIssues = async () => {
      setLoadingIssues(true);
      setIssueError("");

      try {
        const response = await fetch(
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
      const response = await fetch(
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

    try {
      const repository = getRepositoryName(selectedIssue.url);

      const response = await fetch(
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

      const response = await fetch(
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

      const response = await fetch(
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

      setCodeProposal(data.result);
      setCodeReview(null);
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

    try {
      const repository = getRepositoryName(selectedIssue.url);

      const response = await fetch(
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

      setCodeReview(data.result);
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

  const handleForkRepository = async () => {
  if (!selectedIssue) {
    setForkError("No issue selected.");
    return;
  }

  setForkingRepository(true);
  setForkError("");

  try {
    const repository = getRepositoryName(selectedIssue.url);
    const [owner, repo] = repository.split("/");

    const response = await fetch(
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

    setForkedRepository(data.repository.fullName);
  } catch (error) {
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

      const repositoryResponse = await fetch(
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

      const response = await fetch(
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
      const content = typeof item.after === "string" ? item.after : "";
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

    try {
      const parts = forkedRepository.split("/");
      const [owner, repo] = parts;
      if (!owner || !repo) {
        throw new Error("The fork repository name is invalid.");
      }

      // Commit actual proposed source files, not a JSON description of the proposal.
      // Sequential writes avoid racing GitHub's branch-head updates.
      for (const change of normalizedChanges) {
        const response = await fetch(`${API_BASE_URL}/api/github/file`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner,
            repo,
            branchName,
            filePath: change.filePath,
            content: change.content,
            commitMessage: "AI contribution: update " + change.filePath,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            data.error || "Failed to commit " + change.filePath + "."
          );
        }
      }

      setCommitSuccess(true);
    } catch (error) {
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
    const response = await fetch(
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
          baseBranch,
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
                      onClick={() => {
                        setApproved(true);
                        void handleForkRepository();
                      }}
                      disabled={forkingRepository}
                    >
                      {forkingRepository
                        ? "Forking Repository..."
                        : "Approve Contribution"}
                    </button>

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






