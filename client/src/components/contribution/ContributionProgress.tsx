type ContributionProgressProps = {
  currentStage: number;
};

const stages = [
  "Find Issue",
  "Analyze Repository",
  "Build Solution",
  "Run Tests",
  "Your Review",
];

function ContributionProgress({
  currentStage,
}: ContributionProgressProps) {
  return (
    <div className="contribution-progress">
      {stages.map((stage, index) => {
        const isCompleted = index < currentStage;
        const isActive = index === currentStage;

        return (
          <div
            className={`progress-stage ${
              isCompleted ? "completed" : ""
            } ${isActive ? "active" : ""}`}
            key={stage}
          >
            <div className="progress-number">{index + 1}</div>

            <span>{stage}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ContributionProgress;