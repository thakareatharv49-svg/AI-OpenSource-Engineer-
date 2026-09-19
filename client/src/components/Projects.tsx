import "./Projects.css";

function Projects() {
  return (
    <section id="projects" className="projects">
      <div className="projects-content">
        <h2>Open Source Projects</h2>
        <p>
          Discover AI-powered open source projects and start contributing.
        </p>

        <div className="project-card">
          <h3>AI Open Source Engineer</h3>
          <p>
            Explore AI tools, agents, and open source projects built by the
            community.
          </p>

         <a
  href="https://github.com/"
  target="_blank"
  rel="noopener noreferrer"
  className="project-button"
>
  View Project
</a>
        </div>
      </div>
    </section>
  );
}

export default Projects;