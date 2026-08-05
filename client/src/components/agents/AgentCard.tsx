type AgentCardProps = {
  name: string
  description: string
  icon: string
}

function AgentCard({ name, description, icon }: AgentCardProps) {
  return (
    <div className="group rounded-2xl border border-gray-800 bg-gray-900/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500 hover:bg-gray-900">

      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600/10 text-3xl ring-1 ring-blue-500/20">
        {icon}
      </div>

      <h3 className="text-xl font-semibold text-white">
        {name}
      </h3>

      <p className="mt-3 min-h-[48px] text-sm leading-6 text-gray-400">
        {description}
      </p>

      <button className="mt-6 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-medium text-white transition hover:border-blue-500 hover:bg-blue-600">
        Open Agent →
      </button>

    </div>
  )
}

export default AgentCard