import { useState } from "react"
import HomePage from "./pages/HomePage"
import TaskView from "./pages/TaskView"

function App() {
  const [page, setPage] = useState<"home" | "task">("task")

  return (
    <>
      {page === "home" && <HomePage />}
      {page === "task" && <TaskView />}

      {/* Dev nav — temp toggle */}
      <div className="fixed bottom-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => setPage("home")}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            page === "home" ? "bg-text text-white" : "bg-white border border-[#E8D5B5] text-text"
          }`}
        >
          Home
        </button>
        <button
          onClick={() => setPage("task")}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            page === "task" ? "bg-text text-white" : "bg-white border border-[#E8D5B5] text-text"
          }`}
        >
          Task View
        </button>
      </div>
    </>
  )
}

export default App