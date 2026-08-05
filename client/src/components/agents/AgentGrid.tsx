import AgentCard from "./AgentCard"

const agents = [
  {
    name: "Issue Finder",
    description: "Finds suitable open-source issues based on your skills.",
    icon: "🔍",
  },
  {
    name: "Repository Analyzer",
    description: "Analyzes repositories, structure, documentation, and issues.",
    icon: "🧠",
  },
  {
    name: "Coding Agent",
    description: "Helps understand issues and generate implementation code.",
    icon: "💻",
  },
  {
    name: "Testing Agent",
    description: "Creates and runs tests to verify your changes.",
    icon: "🧪",
  },
  {
    name: "Pull Request Agent",
    description: "Prepares pull requests, descriptions, and review summaries.",
    icon: "🚀",
  },
  {
    name: "Code Review Agent",
    description: "Reviews your code and identifies possible improvements.",
    icon: "🔎",
  },
]

function AgentGrid() {
  return (
    <section
  id="agents"
  className="bg-gray-950 px-6 py-24 text-white"
>

      <div className="mx-auto max-w-7xl">

        <div className="mb-12 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-500">
            AI Agent Team
          </p>

          <h2 className="mt-3 text-4xl font-bold">
            Your Open Source AI Team
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-gray-400">
            Specialized agents work together to automate different stages
            of your open-source contribution workflow.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.name}
              name={agent.name}
              description={agent.description}
              icon={agent.icon}
            />
          ))}
        </div>

      </div>
    </section>
  )
}

export default AgentGrid