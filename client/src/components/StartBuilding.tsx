import "./StartBuilding.css";
import { useNavigate } from "react-router-dom";

function StartBuilding() {
  const navigate = useNavigate();

  return (
    <section className="start-building">
      <div className="start-building-content">
        <span className="start-building-label">AI-POWERED CONTRIBUTION</span>

        <h2>Start Building</h2>

        <p>
          Let AI find an open-source issue, understand the repository,
          implement the solution, and prepare a pull request for your review.
        </p>

        <div className="start-building-steps">
          <span>Find Issue</span>
          <span>→</span>
          <span>Build Solution</span>
          <span>→</span>
          <span>Run Tests</span>
          <span>→</span>
          <span>You Verify</span>
        </div>

        <button
          className="start-building-button"
          onClick={() => navigate("/contribution")}
        >
          Start Contribution
        </button>
      </div>
    </section>
  );
}

export default StartBuilding;