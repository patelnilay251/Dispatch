import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router"
import { motion } from "framer-motion"

/* ─── Types ─── */
type TaskSummary = {
  id: string
  prompt: string
  repo: string
  branch: string
  status: "pending" | "running" | "completed" | "failed"
  progress: number
  current_step: string
  steps_completed: number
  steps_total: number
  created_at: string
}

/* ─── Animation ─── */
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
}

/* ─── Helpers ─── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

/** Derive a smart badge from the pipeline state */
function deriveStatus(task: TaskSummary): { label: string; className: string } {
  if (task.status === "completed") {
    return { label: "PR Ready", className: "bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9]" }
  }
  if (task.status === "failed") {
    return { label: "Failed", className: "bg-[#FFEBEE] text-[#C62828] border border-[#FFCDD2]" }
  }
  if (task.status === "pending") {
    return { label: "Queued", className: "bg-[#F5F5F5] text-[#888] border border-[#E0E0E0]" }
  }
  // running — derive from current step
  const step = task.current_step.toLowerCase()
  if (step.includes("test")) {
    return { label: "Testing", className: "bg-[#FFF3E0] text-[#F57C00] border border-[#FFE0B2]" }
  }
  if (step.includes("pull request") || step.includes("pr") || task.progress >= 95) {
    return { label: "PR Ready", className: "bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9]" }
  }
  return { label: "Running", className: "bg-[#E3F2FD] text-[#1976D2] border border-[#BBDEFB]" }
}

/* ─── Icons ─── */
const RepoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0">
    <path d="M6 9v6M18 9v2a2 2 0 0 1-2 2h-4a2 2 0 0 0-2 2v2M6 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
  </svg>
)

/* ─── Active Task Card ─── */
function TaskCard({ task, onClick }: { task: TaskSummary; onClick: () => void }) {
  const badge = deriveStatus(task)
  const showProgress = task.status === "running" || task.status === "pending"

  return (
    <motion.div
      variants={fadeUp}
      onClick={onClick}
      className="bg-white rounded-lg p-6 cursor-pointer border border-black/5 shadow-[0_4px_12px_rgba(0,0,0,0.03)] flex flex-col gap-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(0,0,0,0.06)]"
    >
      {/* Header: repo + status */}
      <div className="flex items-start justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
          <RepoIcon />
          {task.repo}
        </span>
        <span className={`text-[11px] font-semibold uppercase tracking-[0.05em] px-2.5 py-1 rounded ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Title */}
      <p className="text-[16px] font-medium leading-[1.4] text-text line-clamp-2">
        {task.prompt}
      </p>

      {/* Progress */}
      {showProgress && (
        <div>
          <div className="h-1.5 bg-[#F0F0F0] rounded-[3px] overflow-hidden">
            <div
              className="h-full rounded-[3px] transition-all duration-1000 ease-in-out"
              style={{
                width: `${task.progress}%`,
                background: task.progress >= 100
                  ? "#4CAF50"
                  : `linear-gradient(90deg, var(--color-c-orange), var(--color-c-red))`,
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[12px] text-text-muted">
            <span>{task.current_step || "Initializing..."}</span>
            <span>{task.progress}%</span>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ─── Completed Task Card ─── */
function CompletedCard({ task, onClick }: { task: TaskSummary; onClick: () => void }) {
  return (
    <motion.div
      variants={fadeUp}
      onClick={onClick}
      className="bg-white rounded-lg p-6 cursor-pointer border border-dashed border-black/10 opacity-70 flex flex-col gap-4 transition-all duration-200 hover:-translate-y-1 hover:opacity-90 hover:shadow-[0_8px_20px_rgba(0,0,0,0.04)]"
    >
      {/* Header: repo + time */}
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-semibold text-text-muted">
          {task.repo}
        </span>
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">
          {task.status === "failed" ? "Failed" : "Completed"} {timeAgo(task.created_at)}
        </span>
      </div>

      {/* Title */}
      <p className="text-[16px] font-medium leading-[1.4] text-text line-clamp-2">
        {task.prompt}
      </p>
    </motion.div>
  )
}

/* ─── Main Dashboard ─── */
export default function DashboardPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<TaskSummary[]>([])

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks")
      const data = await res.json()
      setTasks(data.tasks || [])
    } catch { /* backend down */ }
  }, [])

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 3000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  const activeTasks = tasks.filter(t => t.status === "running" || t.status === "pending")
  const completedTasks = tasks.filter(t => t.status === "completed" || t.status === "failed")

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      <div className="grid-bg z-0" />

      <main className="flex-1 relative z-10 max-w-[1400px] w-full mx-auto px-12 py-12">
        {/* ── Active Tasks ── */}
        <motion.div
          className="flex items-end justify-between mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[24px] font-medium tracking-[-0.02em] text-text">Active Tasks</h2>
          <div className="flex items-center gap-6">
            <span className="text-[14px] text-text-muted">
              {activeTasks.length} Agent{activeTasks.length !== 1 ? "s" : ""} Running
            </span>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 px-[18px] py-[10px] text-[13px] font-medium text-white bg-text rounded transition-all duration-200 hover:scale-[1.03] hover:shadow-md active:scale-95"
            >
              New Agent Task
            </button>
          </div>
        </motion.div>

        {activeTasks.length > 0 ? (
          <motion.div
            className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-6 mb-12"
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {activeTasks.map(task => (
              <TaskCard key={task.id} task={task} onClick={() => navigate(`/task/${task.id}`)} />
            ))}
          </motion.div>
        ) : (
          <motion.div
            className="border border-dashed border-[#E8D5B5] rounded-lg p-16 text-center mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <p className="text-[14px] text-text-muted">No active tasks</p>
            <p className="text-[12px] text-text-muted/60 mt-1">Create a new agent task to get started</p>
          </motion.div>
        )}

        {/* ── Completed Tasks ── */}
        {completedTasks.length > 0 && (
          <>
            <motion.div
              className="flex items-end justify-between mb-4 mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              <h2 className="text-[24px] font-medium tracking-[-0.02em] text-text">Completed Tasks</h2>
            </motion.div>

            <motion.div
              className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-6"
              variants={stagger}
              initial="hidden"
              animate="visible"
            >
              {completedTasks.map(task => (
                <CompletedCard key={task.id} task={task} onClick={() => navigate(`/task/${task.id}`)} />
              ))}
            </motion.div>
          </>
        )}
      </main>
    </div>
  )
}
