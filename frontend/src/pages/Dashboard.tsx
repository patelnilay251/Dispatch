import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router"
import { motion } from "framer-motion"
import { useAuth } from "../lib/auth"
import { apiFetch } from "../lib/api"

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (d: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: d, ease: [0.16, 1, 0.3, 1] } }),
}

type TaskSummary = {
  id: string
  prompt: string
  repo: string
  branch: string
  status: string
  summary: string
  iterations: number
  total_tokens: number
  created_at: string
  completed_at: string | null
}

/* ─── Pixel processing indicator ─── */
function PixelLoader() {
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-0.5 shrink-0">
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="w-2.5 h-2.5 bg-text"
          style={{ opacity: i === 3 ? 0 : 0.1 }}
          animate={i < 3 ? { opacity: [0.1, 1, 0.1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, loading, signIn, signOut } = useAuth()
  const [tasks, setTasks] = useState<TaskSummary[]>([])

  // Redirect to home if not logged in
  useEffect(() => {
    if (!loading && !user) navigate("/")
  }, [loading, user, navigate])

  // Fetch tasks with polling (authenticated)
  useEffect(() => {
    if (!user) return

    const fetchTasks = async () => {
      try {
        const res = await apiFetch("/tasks")
        if (res.ok) {
          const data = await res.json()
          setTasks(data.tasks || [])
        }
      } catch { /* backend not running */ }
    }
    fetchTasks()
    const interval = setInterval(fetchTasks, 3000)
    return () => clearInterval(interval)
  }, [user])

  const activeTasks = tasks.filter(t => t.status === "running" || t.status === "pending")
  const completedTasks = tasks.filter(t => t.status === "completed" || t.status === "failed")
  const successCount = tasks.filter(t => t.status === "completed").length
  const totalTokens = tasks.reduce((sum, t) => sum + (t.total_tokens || 0), 0)
  const rate = tasks.length > 0 ? ((successCount / tasks.length) * 100).toFixed(0) : "—"

  if (loading) return null

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="grid-bg fixed inset-0 z-0" />

      <div className="max-w-[1400px] mx-auto px-12 relative z-10">
        {/* Header */}
        <motion.header
          className="flex justify-between items-center h-16 border-b border-[#E8E3D3]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Link to="/" className="flex items-center gap-2 font-mono text-sm font-medium no-underline text-text opacity-60 hover:opacity-100 transition-opacity">
            <div className="w-4 h-4 bg-c-orange grid grid-cols-2 grid-rows-2 gap-px p-px">
              <div className="bg-bg opacity-0" />
              <div className="bg-bg" />
              <div className="bg-bg" />
              <div className="bg-bg" />
            </div>
            Dispatch
          </Link>
          <div className="flex items-center gap-5">
            {user && (
              <button
                onClick={signOut}
                className="flex items-center gap-2 bg-transparent border-none cursor-pointer group"
              >
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt=""
                    className="w-5 h-5 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#E8D5B5] opacity-60 group-hover:opacity-100 transition-opacity" />
                )}
                <span className="font-mono text-xs text-text-muted group-hover:text-text transition-colors">
                  {user.user_metadata?.user_name}
                </span>
              </button>
            )}
            <button
              onClick={() => navigate("/")}
              className="bg-text text-bg border-none h-8 px-4 font-mono text-xs font-medium cursor-pointer flex items-center gap-3 hover:opacity-90 transition-opacity"
            >
              Deploy Agent <span className="text-c-orange">→</span>
            </button>
          </div>
        </motion.header>

        {/* Stats */}
        <section className="grid grid-cols-4 gap-10 py-16 border-b border-[#E8E3D3]">
          {[
            { label: "Total Executions", value: String(tasks.length || "0") },
            { label: "Active Agents", value: String(activeTasks.length).padStart(2, "0") },
            { label: "Success Rate", value: tasks.length > 0 ? `${rate}%` : "—" },
            { label: "Total Tokens", value: totalTokens > 0 ? formatTokens(totalTokens) : "—" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              className="flex flex-col gap-1.5"
              variants={fadeUp}
              custom={0.1 + i * 0.08}
              initial="hidden"
              animate="visible"
            >
              <span className="font-mono text-[11px] uppercase text-text-muted tracking-[0.05em]">{s.label}</span>
              <span className="text-[clamp(2.2rem,4vw,3.5rem)] font-normal tracking-[-0.04em] leading-none">{s.value}</span>
            </motion.div>
          ))}
        </section>

        {/* Split: Live + History */}
        <div className="grid grid-cols-[1.2fr_1fr] gap-16 py-14 items-start">
          {/* Live Telemetry */}
          <motion.section variants={fadeUp} custom={0.3} initial="hidden" animate="visible">
            <div className="font-mono text-[11px] uppercase tracking-[0.05em] mb-8 pb-2 border-b border-text inline-block">
              Live Telemetry
            </div>
            <div className="flex flex-col gap-6">
              {activeTasks.length === 0 && (
                <div className="py-12 text-center text-text-muted text-sm">
                  No active agents. Deploy one to get started.
                </div>
              )}
              {activeTasks.map((task, i) => (
                <motion.button
                  key={task.id}
                  onClick={() => navigate(`/task/${task.id}`)}
                  className={`${i % 2 === 0 ? "bg-c-orange" : "bg-c-yellow"} p-7 border border-text grid grid-cols-[1fr_auto] gap-5 cursor-pointer text-left relative overflow-hidden transition-opacity hover:opacity-95`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex flex-col gap-3 z-[2]">
                    <div className="font-mono text-base font-medium">{task.repo || "dispatch/core-agent"}</div>
                    <div className="text-xl font-medium tracking-[-0.02em] leading-[1.1]">
                      {task.prompt.length > 60 ? task.prompt.slice(0, 60) + "..." : task.prompt}
                    </div>
                    <div className="font-mono text-xs opacity-80">
                      [{task.id}] {task.iterations > 0 ? `${task.iterations} iterations` : "starting..."}
                    </div>
                  </div>
                  <PixelLoader />
                </motion.button>
              ))}
            </div>
          </motion.section>

          {/* Execution Log */}
          <motion.section variants={fadeUp} custom={0.35} initial="hidden" animate="visible">
            <div className="font-mono text-[11px] uppercase tracking-[0.05em] mb-8 pb-2 border-b border-text inline-block">
              Execution Log
            </div>
            <div className="flex flex-col">
              <div className="grid grid-cols-[20px_1fr_auto_auto] gap-5 items-center h-9 border-b border-text font-mono text-[11px] uppercase tracking-[0.05em] text-text-muted">
                <div />
                <div>Task</div>
                <div className="text-right">Duration</div>
                <div className="text-right opacity-50">ID</div>
              </div>
              {completedTasks.length === 0 && (
                <div className="py-10 text-center text-text-muted text-sm">
                  No completed tasks yet.
                </div>
              )}
              {completedTasks.map((task, i) => (
                <motion.button
                  key={task.id}
                  onClick={() => navigate(`/task/${task.id}`)}
                  className="grid grid-cols-[20px_1fr_auto_auto] gap-5 items-center h-9 border-b border-[#E8E3D3] font-mono text-xs cursor-pointer bg-transparent border-x-0 border-t-0 text-left hover:bg-[#F6F3E6] transition-colors w-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.5 + i * 0.05 }}
                >
                  <div className="justify-self-center">
                    <div className={`w-2.5 h-2.5 ${
                      task.status === "completed" ? "bg-text" : "border-2 border-c-red bg-transparent"
                    }`} />
                  </div>
                  <div className="font-medium truncate" title={task.prompt}>
                    {task.repo ? `${task.repo.split("/").pop()} — ` : ""}
                    {task.prompt.length > 40 ? task.prompt.slice(0, 40) + "..." : task.prompt}
                  </div>
                  <div className="text-right text-text-muted">{formatDuration(task.created_at, task.completed_at)}</div>
                  <div className="text-right text-text-muted opacity-50">#{task.id.split("-")[1] || task.id.slice(-4)}</div>
                </motion.button>
              ))}
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  )
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return timeSince(start)
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function timeSince(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}
