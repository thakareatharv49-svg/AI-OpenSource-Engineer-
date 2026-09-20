import { useEffect, useState } from "react";
import "./Contribution.css";
import ContributionProgress from "../../components/contribution/ContributionProgress";

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
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState(0);
  const [approved, setApproved] = useState(false);

  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [issueError, setIssueError] = useState("");

  const [selectedIssue, setSelectedIssue] =
    useState<GitHubIssue | null>(null);

  const [aiSelection, setAISelection] =
    useState<AISelection | null>(null);

  const [selectingIssue, setSelectingIssue] = useState(false);
  const [aiError, setAiError] = useState("");

  const [repositoryAnalysis, setRepositoryAnalysis] =
    useState<RepositoryAnalysis | null>(null);

  const [analyzingRepository, setAnalyzingRepository] =
    useState(false);

  const [repositoryError, setRepositoryError] = useState("");

  const [solutionPlan, setSolutionPlan] = useState<SolutionPlan | null>(null);
  const [buildingSolution, setBuildingSolution] = useState(false);
  const [solutionError, setSolutionError] = useState("");

  const [codeProposal, setCodeProposal] = useState<Record<string, unknown> | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (!started || stage !== 0) return;

    const fetchIssues = async () => {
      setLoadingIssues(true);
      setIssueError("");

      try {
        const response = await fetch(
          "http://localhost:5000/api/github/issues"
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
  }, [started, stage]);

  const handleAISelection = async () => {
    if (issues.length === 0) return;

    setSelectingIssue(true);
    setAiError("");

    try {
      const response = await fetch(
        "http://localhost:5000/api/ai/select-issue",
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
        "http://localhost:5000/api/ai/analyze-repository",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository: repository,
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
        "http://localhost:5000/api/ai/build-solution",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository: repository,
            issue: selectedIssue,
            repositoryAnalysis: repositoryAnalysis,
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
    if (!selectedIssue || !repositoryAnalysis || !solutionPlan) return;

    setGeneratingCode(true);
    setCodeError("");

    try {
      const repository = getRepositoryName(selectedIssue.url);

      const response = await fetch(
        "http://localhost:5000/api/ai/generate-code",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repository: repository,
            issue: selectedIssue,
            repositoryAnalysis,
            solutionPlan,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Code generation failed");
      }

      setCodeProposal(data.result);
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
        ) : approved ? (
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

                {issueError && <p>{issueError}</p>}

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
                                    {typeof item === "object" && item !== null ? JSON.stringify(item, null, 2) : String(item)}
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

                  {Object.entries(solutionPlan).map(([key, value]) => (
                    <div key={key}>
                      <h3>
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (char) => char.toUpperCase())}
                      </h3>

                      {Array.isArray(value) ? (
                        <ul>
                          {value.map((item, index) => (
                            <li key={index}>{typeof item === "object" && item !== null ? JSON.stringify(item, null, 2) : String(item)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>{String(value)}</p>
                      )}
                    </div>
                  ))}
                  <br />
                  <button
                    className="contribution-start-button"
                    onClick={handleGenerateCode}
                    disabled={generatingCode}
                  >
                    {generatingCode ? "Generating Code..." : "Generate Code"}
                  </button>

                  {codeError && <p>{codeError}</p>}
                </div>
              </div>
            )}

            {stage === 3 && codeProposal && (
              <div className="workflow-step">
                <span className="workflow-number">{stages[stage].step}</span>
                <div>
                  <h2>Code Proposal</h2>
                  {Object.entries(codeProposal).map(([key, value]) => (
                    <div key={key}>
                      <h3>{key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase())}</h3>
                      {Array.isArray(value) ? (
                        <ul>{value.map((item, index) => <li key={index}>{typeof item === "object" && item !== null ? JSON.stringify(item, null, 2) : String(item)}</li>)}</ul>
                      ) : <p>{typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value)}</p>}
                    </div>
                  ))}
                  <br />
                  <button
                    className="contribution-start-button"
                    onClick={() => setStage(4)}
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
                <button
                  className="contribution-start-button"
                  onClick={() => setApproved(true)}
                >
                  Approve Contribution
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default Contribution;
