function Hero() {
  return (
    <section className="min-h-screen flex items-center justify-center bg-gray-950 text-white px-6">
      <div className="max-w-4xl text-center">

        <div className="mb-6 inline-block rounded-full border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-300">
          🤖 AI-Powered Open Source Engineering
        </div>

        <h1 className="text-6xl font-bold tracking-tight">
          Your AI Team for
          <span className="block text-blue-500">
            Open Source
          </span>
        </h1>

        <p className="mt-6 text-lg text-gray-400 max-w-2xl mx-auto">
          Discover projects, analyze issues, write code, create pull requests,
          run tests, and manage your entire open-source workflow with
          intelligent AI agents.
        </p>

        <div className="mt-10 flex justify-center gap-4">
          <button className="rounded-lg bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-700">
            Start Building
          </button>

         <a
  href="#agents"
  className="rounded-lg border border-gray-700 px-6 py-3 font-semibold hover:bg-gray-900"
>
  Explore Agents
</a>
        </div>

      </div>
    </section>
  )
}

export default Hero