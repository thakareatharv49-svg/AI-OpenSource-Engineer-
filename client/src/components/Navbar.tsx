function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            🤖
          </div>

          <span className="text-lg font-bold text-white">
            AI Open Source Engineer
          </span>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          <a
  className="text-sm text-gray-300 hover:text-white"
  href="#agents"
>
  Agents
</a>

          <a className="text-sm text-gray-300 hover:text-white" href="#">
            Projects
          </a>

          <a className="text-sm text-gray-300 hover:text-white" href="#">
            GitHub
          </a>

          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Dashboard
          </button>
        </div>

      </div>
    </nav>
  )
}

export default Navbar