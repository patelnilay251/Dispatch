import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "react-router"
import { motion, AnimatePresence } from "framer-motion"

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (d: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: d, ease: [0.16, 1, 0.3, 1] } }),
}

const streamIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

type StepStatus = "wait" | "active" | "done" | "failed"
type Step = { id: string; label: string; status: StepStatus; detail: string }
type TaskMeta = { id: string; prompt: string; repo: string; branch: string }

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "done") return <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#22C55E]" />
  if (status === "active") return <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-c-orange animate-[pulse_1.5s_infinite]" />
  if (status === "failed") return <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#EF4444]" />
  return <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#DDD]" />
}
/* ─── Phase divider ─── */
function PhaseHeader({ label, status }: { label: string; status: StepStatus }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className={`w-1.5 h-1.5 rounded-full ${status === "done" ? "bg-[#22C55E]" : status === "active" ? "bg-c-orange animate-[pulse_1.5s_infinite]" : "bg-[#DDD]"}`} />
      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-text-muted">
        {label}
      </span>
      <div className="flex-1 h-px bg-[#F0E8D8]" />
    </div>
  )
}

/* ─── Section: Clone — metrics grid ─── */
function CloneSection({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-2 border border-[#F0E8D8] rounded">
      {[
        { label: "Repository", value: String(data.repo) },
        { label: "Target Branch", value: String(data.branch) },
        { label: "Base Commit", value: String(data.commit) },
        { label: "Files Indexed", value: String(data.files) },
      ].map((m, i) => (
        <div
          key={m.label}
          className={`p-4 ${i < 2 ? "border-b border-[#F0E8D8]" : ""} ${i % 2 === 0 ? "border-r border-[#F0E8D8]" : ""}`}
        >
          <div className="text-[10px] uppercase text-text-muted tracking-[0.05em] mb-1">{m.label}</div>
          <div className="text-sm font-mono">{m.value}</div>
        </div>
      ))}
    </div>
  )
}
/* ─── Section: AGENTS.md — doc block ─── */
function AgentsSection({ data }: { data: Record<string, unknown> }) {
  const sections = (data.sections as string[]) || []
  const content: Record<string, string[]> = {
    "Project Context": ["Multi-tenant SaaS platform built with Next.js 14, TypeScript, and Prisma ORM."],
    "Coding Standards": ["strict_typescript: true", "components: functional_with_hooks", "validation: zod_schemas", "coverage_min: 80%"],
    "Architecture": ["auth: src/middleware.ts + src/lib/auth/", "routes: src/app/api/", "database: Prisma + PostgreSQL"],
    "Testing": ["unit: vitest", "e2e: playwright", "run: npm run test"],
  }
  return (
    <div className="bg-[#FAF8F5] border-l-[3px] border-c-orange rounded-r p-4">
      <div className="flex items-center gap-2 mb-3 text-xs text-text-muted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {String(data.path || "AGENTS.md")}
      </div>
      <div className="font-mono text-[13px] leading-[1.6] space-y-1">
        {sections.map((s) => (
          <div key={s}>
            <div className="text-text-muted">{s.toLowerCase().replace(/ /g, "_")}:</div>
            {(content[s] || []).map((l, i) => (
              <div key={i} className="pl-4">
                {l.includes(":") ? (
                  <>
                    <span className="text-text-muted">{l.split(":")[0]}:</span>
                    <span className="text-[#0284C7]"> {l.split(":").slice(1).join(":")}</span>
                  </>
                ) : (
                  <span className="text-[#0284C7]">- "{l}"</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
/* ─── Section: Analyze — data table ─── */
function AnalyzeSection({ data }: { data: Record<string, unknown> }) {
  const affected = (data.affected as Array<{ name: string; deps: number; impact: string }>) || []
  return (
    <div>
      <div className="grid grid-cols-[1fr_80px_80px] font-mono text-[10px] uppercase text-text-muted tracking-[0.05em] border-b border-[#F0E8D8] pb-2 mb-2">
        <div>Target File</div>
        <div className="text-right">Deps</div>
        <div className="text-right">Risk</div>
      </div>
      {affected.map((m) => (
        <div key={m.name} className="grid grid-cols-[1fr_80px_80px] items-center py-2 border-b border-dashed border-[#F0E8D8] last:border-b-0 text-xs">
          <div className="font-mono">{m.name}</div>
          <div className="text-right font-mono text-text-muted">{m.deps}</div>
          <div className="text-right">
            <span className={`inline-block px-1.5 py-px rounded text-[10px] font-medium border ${
              m.impact === "high" ? "bg-[#FFEBEB] text-[#DC2626] border-[#FCA5A5]" :
              m.impact === "medium" ? "bg-[#FFF8E1] text-[#D97706] border-[#FDE68A]" :
              "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]"
            }`}>
              {m.impact.toUpperCase()}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Section: Plan — numbered steps ─── */
function PlanSection({ data }: { data: Record<string, unknown> }) {
  const planSteps = (data.steps as Array<{ num: number; title: string; file: string; description: string }>) || []
  return (
    <div>
      {planSteps.map((s, i) => (
        <div key={s.num} className={`flex gap-4 ${i < planSteps.length - 1 ? "pb-4 mb-4 border-b border-[#F0E8D8]" : ""}`}>
          <div className="font-mono text-lg text-c-orange font-light leading-none mt-0.5">
            {String(s.num).padStart(2, "0")}
          </div>
          <div>
            <div className="text-sm leading-[1.4] mb-2">{s.description}</div>
            <div className="flex gap-2 flex-wrap">
              <span className="font-mono text-[11px] bg-[#FAF8F5] border border-[#F0E8D8] px-2 py-0.5 rounded-full text-text-muted">
                {s.file}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
/* ─── Section: Index — module grid with visual bars ─── */
function IndexSection({ data }: { data: Record<string, unknown> }) {
  const modules = (data.modules as Array<{ module: string; files: number; symbols: number }>) || []
  const maxSymbols = Math.max(...modules.map(m => m.symbols), 1)
  return (
    <div className="grid grid-cols-2 gap-3">
      {modules.map((m) => {
        const ratio = m.symbols / maxSymbols
        const filled = Math.round(ratio * 4)
        return (
          <div key={m.module} className="border border-[#F0E8D8] rounded p-3">
            <div className="flex justify-between mb-3">
              <span className="text-[13px] font-medium">{m.module}/</span>
              <span className="font-mono text-[11px] text-text-muted">{m.files} files</span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-sm ${
                    i < filled ? (i === 0 ? "bg-c-orange" : "bg-c-yellow") : "bg-[#F0E8D8]"
                  }`}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
/* ─── Section: Refactor — dark terminal panel ─── */
function RefactorSection({ data }: { data: Record<string, unknown> }) {
  const diff = (data.diff as Array<{ num: number; content: string; type?: string }>) || []
  return (
    <div className="bg-[#111] rounded-md overflow-hidden text-[#E5E5E5] -mx-1">
      <div className="flex bg-[#1A1A1A] border-b border-[#333] px-4">
        <div className="py-2.5 px-4 text-xs font-mono text-c-orange border-b-2 border-c-orange">
          {String(data.file)}
        </div>
      </div>
      <div className="p-4 font-mono text-[13px] leading-[1.6] overflow-x-auto">
        {diff.map((line, i) => (
          <div
            key={i}
            className={`flex gap-4 ${
              line.type === "added" ? "text-[#4ADE80] bg-[rgba(74,222,128,0.1)]" :
              line.type === "removed" ? "text-[#F87171] bg-[rgba(248,113,113,0.1)]" :
              "text-[#666]"
            }`}
          >
            <span>{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
            <span>{line.content || "\u00A0"}</span>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 bg-black border-t border-[#333] font-mono text-xs">
        <span className="text-c-orange">{">"}</span>
        <span className="ml-2">dispatch apply --strict</span>
        <span className="text-[#4ADE80] ml-2">Changes applied.</span>
      </div>
    </div>
  )
}

/* ─── Section: Test — test list ─── */
function TestSection({ data }: { data: Record<string, unknown> }) {
  const tests = (data.tests as Array<{ name: string; time: string }>) || []
  return (
    <div className="border border-[#F0E8D8] rounded">
      {tests.map((t, i) => (
        <div
          key={i}
          className={`flex justify-between items-center px-4 py-3 text-[13px] ${
            i < tests.length - 1 ? "border-b border-[#F0E8D8]" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-c-orange text-sm font-bold">✓</span>
            <span className="font-mono">{t.name}</span>
          </div>
          <span className="font-mono text-[11px] text-text-muted">{t.time}</span>
        </div>
      ))}
    </div>
  )
}
/* ─── Section: PR — summary ─── */
function PRSection({ data }: { data: Record<string, unknown> }) {
  const files = (data.changed_files as Array<{ name: string; added: number; removed: number }>) || []
  const totalAdded = files.reduce((s, f) => s + f.added, 0)
  const totalRemoved = files.reduce((s, f) => s + f.removed, 0)
  return (
    <div>
      <div className="font-mono text-[10px] text-c-orange uppercase tracking-wider mb-2">Ready for Review</div>
      <h2 className="text-xl font-medium tracking-[-0.02em] mb-2">{String(data.title)}</h2>
      <p className="text-sm text-text-muted leading-[1.5] mb-6">{String(data.description)}</p>
      <div className="flex gap-6 pt-4 border-t border-[#F0E8D8] font-mono">
        <div>
          <div className="text-lg font-medium text-[#4ADE80]">+{totalAdded}</div>
          <div className="text-[11px] uppercase text-text-muted">Additions</div>
        </div>
        <div>
          <div className="text-lg font-medium text-[#F87171]">-{totalRemoved}</div>
          <div className="text-[11px] uppercase text-text-muted">Deletions</div>
        </div>
        <div>
          <div className="text-lg font-medium">{files.length}</div>
          <div className="text-[11px] uppercase text-text-muted">Files</div>
        </div>
      </div>
    </div>
  )
}

/* ─── Active loading indicator ─── */
function ActiveLoader() {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="grid grid-cols-3 grid-rows-3 gap-px">
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div
            key={i}
            className="w-[6px] h-[6px] rounded-sm bg-[#F0E8D8]"
            animate={{ backgroundColor: ["#F0E8D8", "#FF5500", "#F0E8D8"] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="font-mono text-xs text-text-muted">Processing...</span>
    </div>
  )
}
/* ─── Section renderer ─── */
const sectionMap: Record<string, React.FC<{ data: Record<string, unknown> }>> = {
  clone: CloneSection, agents: AgentsSection, analyze: AnalyzeSection,
  plan: PlanSection, index: IndexSection, refactor: RefactorSection,
  test: TestSection, pr: PRSection,
}

export default function TaskView() {
  const { id } = useParams()
  const [meta, setMeta] = useState<TaskMeta>({ id: id || "", prompt: "", repo: "", branch: "" })
  const [steps, setSteps] = useState<Step[]>([])
  const [selectedStep, setSelectedStep] = useState("")
  const [stepData, setStepData] = useState<Record<string, Record<string, unknown>>>({})
  const [allDone, setAllDone] = useState(false)
  const [connected, setConnected] = useState(false)

  // Track which steps have completed (in order) for the stream
  const [completedOrder, setCompletedOrder] = useState<string[]>([])
  const [activeStepId, setActiveStepId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Auto-scroll to bottom when new content appears
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }
  }, [completedOrder, activeStepId])
  // Scroll to section when sidebar item clicked
  const scrollToSection = useCallback((stepId: string) => {
    setSelectedStep(stepId)
    const el = sectionRefs.current[stepId]
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [])

  // SSE connection
  useEffect(() => {
    if (!id) return

    const es = new EventSource(`/api/tasks/${id}/stream`)
    setConnected(true)

    es.addEventListener("task_init", (e) => {
      const payload = JSON.parse(e.data)
      const d = payload.data
      setMeta({ id: d.id, prompt: d.prompt, repo: d.repo, branch: d.branch })
      const initSteps = (d.steps || []).map((s: { id: string; label: string; status: string }) => ({
        id: s.id, label: s.label, status: s.status as StepStatus, detail: "",
      }))
      setSteps(initSteps)
      if (initSteps.length) setSelectedStep(initSteps[0].id)
    })

    es.addEventListener("step_update", (e) => {
      const payload = JSON.parse(e.data)
      setSteps(prev => prev.map(s =>
        s.id === payload.step_id
          ? { ...s, status: payload.status as StepStatus, detail: payload.detail }
          : s
      ))

      if (payload.status === "active") {
        setActiveStepId(payload.step_id)
        setSelectedStep(payload.step_id)
      }

      if (payload.status === "done") {
        setCompletedOrder(prev =>
          prev.includes(payload.step_id) ? prev : [...prev, payload.step_id]
        )
        setActiveStepId(null)
      }
    })

    es.addEventListener("step_output", (e) => {
      const payload = JSON.parse(e.data)
      if (payload.data && payload.step_id) {
        setStepData(prev => ({ ...prev, [payload.step_id]: payload.data }))
      }
    })

    es.addEventListener("task_complete", () => {
      setAllDone(true)
      es.close()
      setConnected(false)
    })

    es.addEventListener("task_failed", () => {
      es.close()
      setConnected(false)
    })

    es.onerror = () => { es.close(); setConnected(false) }
    return () => { es.close() }
  }, [id])
  // Resolve step label by id
  const stepLabel = (stepId: string) => steps.find(s => s.id === stepId)?.label || stepId

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="grid-bg fixed inset-0 z-0" />

      <div className="max-w-[1344px] mx-auto mt-10 px-12 grid grid-cols-[320px_1fr] gap-8 relative z-10">
        {/* Sidebar */}
        <motion.aside
          className="bg-[#FFFDF8] border border-[#E8D5B5] rounded-lg flex flex-col h-[calc(100vh-80px)]"
          variants={fadeUp} custom={0.1} initial="hidden" animate="visible"
        >
          <div className="px-5 py-5 border-b border-[#F0E8D8]">
            <h2 className="text-xs font-medium uppercase tracking-[0.05em] text-text-muted">Execution Logs</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {steps.map((step, i) => (
              <button
                key={i}
                onClick={() => scrollToSection(step.id)}
                className={`w-full flex gap-3 px-3 py-3 rounded-md mb-0.5 text-[13px] leading-relaxed transition-all duration-200 text-left cursor-pointer ${
                  selectedStep === step.id
                    ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    : "hover:bg-[#FFFBF5]"
                }`}
              >
                <StatusDot status={step.status} />
                <div>
                  <div className={`font-medium ${step.status === "wait" ? "text-[#BBB]" : ""}`}>{step.label}</div>
                  <div className={`text-[11px] mt-0.5 ${step.status === "wait" ? "text-[#CCC]" : "text-text-muted"}`}>
                    {step.status === "active" ? "In progress..." : step.status === "wait" ? "Queued" : step.detail || "Completed"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.aside>
        {/* Main */}
        <main className="flex flex-col gap-6 h-[calc(100vh-80px)]">
          {/* Header */}
          <motion.div
            className="bg-white border border-[#E8D5B5] rounded-lg px-6 py-5 flex justify-between items-center shrink-0"
            variants={fadeUp} custom={0.15} initial="hidden" animate="visible"
          >
            <div>
              <h1 className="text-lg font-medium mb-1">{meta.prompt || "Loading..."}</h1>
              <div className="text-[13px] text-text-muted flex gap-4">
                <span>ID: <code className="font-mono">{meta.id}</code></span>
                <span>Repo: <code className="font-mono">{meta.repo}</code></span>
                {meta.branch && <span>Branch: <code className="font-mono">{meta.branch}</code></span>}
              </div>
            </div>
            <div className="flex items-center gap-5">
              {allDone ? (
                <div className="flex items-center gap-2 text-[13px] text-[#22C55E]"><span>✓</span> Complete</div>
              ) : connected ? (
                <div className="flex items-center gap-2 text-[13px] text-text-muted">
                  <div className="w-1.5 h-1.5 rounded-full bg-c-orange animate-[pulse_1.5s_infinite]" />
                  Executing
                </div>
              ) : (
                <div className="text-[13px] text-text-muted">Disconnected</div>
              )}
            </div>
          </motion.div>
          {/* Streaming content panel */}
          <motion.div
            className="bg-white border border-[#E8D5B5] rounded-lg flex-1 min-h-0 overflow-hidden flex flex-col"
            variants={fadeUp} custom={0.2} initial="hidden" animate="visible"
          >
            {/* Panel header */}
            <div className="px-5 py-3 border-b border-[#F0E8D8] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3 font-mono">
                <div className={`w-2 h-2 rounded-full ${allDone ? "bg-[#22C55E]" : "bg-c-orange animate-[pulse_1.5s_infinite]"}`} />
                <span className="text-[11px] uppercase tracking-[0.05em] text-text-muted">
                  Phase // <span className="font-semibold text-text">
                    {allDone ? "COMPLETE" : activeStepId ? stepLabel(activeStepId).toUpperCase() : "INITIALIZING"}
                  </span>
                </span>
              </div>
            </div>

            {/* Scrollable stream */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5">
              <AnimatePresence>
                {completedOrder.map((stepId) => {
                  const data = stepData[stepId]
                  const Section = sectionMap[stepId]
                  if (!data || !Section) return null

                  const step = steps.find(s => s.id === stepId)
                  return (
                    <motion.div
                      key={stepId}
                      ref={(el) => { sectionRefs.current[stepId] = el }}
                      {...streamIn}
                    >
                      <PhaseHeader label={step?.label || stepId} status={step?.status || "done"} />
                      <Section data={data} />
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {/* Active step loader */}
              {activeStepId && !completedOrder.includes(activeStepId) && (
                <motion.div {...streamIn} key="loader">
                  <PhaseHeader label={stepLabel(activeStepId)} status="active" />
                  <ActiveLoader />
                </motion.div>
              )}

              {/* Completion message */}
              {allDone && (
                <motion.div {...streamIn} className="pt-4 border-t border-[#F0E8D8]">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[#22C55E]">
                      All steps completed
                    </span>
                    <div className="flex-1 h-px bg-[#F0E8D8]" />
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  )
}