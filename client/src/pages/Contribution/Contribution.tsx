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

function Contribution() {
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState(0);
  const [approved, setApproved] = useState(false);

  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [issueError, setIssueError] = useState("");

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

  useEffect(() => {
    if (!started || approved || stage === 0) return;

    const timer = setTimeout(() => {
      if (stage < 4) {
        setStage(stage + 1);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [started, stage, approved]);

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
        "AI found potential issues and is now understanding the repository.",
      step: "02",
      name: "Analyzing Repository",
      detail: "Understanding the project structure and relevant files...",
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
      title: "Running Tests...",
      description:
        "AI is testing the changes and checking whether the implementation works correctly.",
      step: "04",
      name: "Run Tests",
      detail: "Running project tests and checking the implementation...",
    },
    {
      title: "Ready for Review",
      description:
        "The AI has completed the contribution and prepared it for your final verification.",
      step: "05",
      name: "Your Review",
      detail: "Review the changes before creating the pull request.",
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
              repository, build the solution, test the changes, and prepare
              everything for your final review.
            </p>

            <div className="contribution-workflow">
              {stages.map((item) => (
                <div className="workflow-step" key={item.step}>
                  <span className="workflow-number">{item.step}</span>

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
                  The AI completed the workflow and you approved the changes.
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

                {!loadingIssues && !issueError && issues.length > 0 && (
                  <>
                    <h2>Issues Found</h2>

                    {issues.slice(0, 5).map((issue) => (
                      <div className="workflow-step" key={issue.id}>
                        <div>
                          <h3>{issue.title}</h3>

                          <p>
                            Reported by @{issue.user}
                          </p>

                          <a
                            href={issue.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Issue →
                          </a>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {stage > 0 && (
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