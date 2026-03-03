import { useState, useEffect, useCallback } from "react"
import { useParams } from "react-router"
import { motion, AnimatePresence } from "framer-motion"

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (d: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: d, ease: [0.16, 1, 0.3, 1] } }),
}
const panelFade = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
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

const FileIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)

function PanelShell({ title, icon, meta, children }: { title: string; icon: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E8D5B5] rounded-lg flex flex-col overflow-hidden h-full">
      <div className="px-5 py-3 border-b border-[#F0E8D8] flex justify-between items-center">
        <div className="text-[13px] font-medium flex items-center gap-2 text-text-muted">{icon}{title}</div>
        {meta && <div className="text-xs text-text-muted">{meta}</div>}
      </div>
      <div className="flex-1 overflow-auto p-5">{children}</div>
    </div>
  )
}
/* ─── Loading / Waiting ─── */
function LoadingPanel({ label }: { label: string }) {
  return (
    <PanelShell title={label} icon={<div className="w-3 h-3 rounded-full bg-c-orange animate-[pulse_1.5s_infinite]" />}>
      <div className="space-y-4 animate-pulse">
        <div className="h-3 bg-[#F0E8D8] rounded w-3/4" />
        <div className="h-3 bg-[#F0E8D8] rounded w-1/2" />
        <div className="h-3 bg-[#F0E8D8] rounded w-5/6" />
        <div className="h-3 bg-[#F0E8D8] rounded w-2/3" />
      </div>
    </PanelShell>
  )
}

function WaitingPanel() {
  return (
    <div className="bg-white border border-[#E8D5B5] rounded-lg flex items-center justify-center h-full">
      <div className="text-sm text-text-muted">Waiting for previous steps to complete...</div>
    </div>
  )
}

/* ─── Data-driven panels ─── */
function ClonePanel({ data }: { data: Record<string, unknown> }) {
  return (
    <PanelShell title={`Clone — ${data.repo}`} icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>}>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-8">
          {[{ label: "Repository", value: String(data.repo) }, { label: "Branch", value: String(data.branch) }, { label: "Commit", value: String(data.commit) }].map((item) => (
            <div key={item.label}>
              <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1.5">{item.label}</div>
              <div className="text-sm font-mono">{item.value}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between mb-3">
            <span className="text-sm">Clone Progress</span>
            <span className="text-xs text-[#22C55E] font-medium">Complete</span>
          </div>
          <div className="w-full h-1.5 bg-[#F0E8D8] rounded-full overflow-hidden">
            <div className="h-full bg-[#22C55E] rounded-full w-full" />
          </div>
          <div className="flex justify-between mt-3 text-xs text-text-muted">
            <span>{String(data.files)} files • {String(data.directories)} directories</span>
            <span>{String(data.size_mb)} MB in {String(data.time_s)}s</span>
          </div>
        </div>
      </div>
    </PanelShell>
  )
}
function AgentsPanel({ data }: { data: Record<string, unknown> }) {
  const sections = (data.sections as string[]) || []
  const content: Record<string, string[]> = {
    "Project Context": ["Multi-tenant SaaS platform built with Next.js 14, TypeScript, and Prisma ORM."],
    "Coding Standards": ["- Strict TypeScript, no `any` types", "- Functional components with hooks", "- Zod schemas for all API inputs", "- Minimum 80% test coverage"],
    "Architecture": ["- Auth: src/middleware.ts + src/lib/auth/", "- API routes: src/app/api/", "- Database: Prisma with PostgreSQL"],
    "Testing": ["- Vitest for unit tests, Playwright for e2e", "- Run: `npm run test`"],
  }
  return (
    <PanelShell title={String(data.path || "AGENTS.md")} icon={<FileIcon />} meta="Project root">
      <div className="font-mono text-[13px] leading-[1.8] space-y-5">
        {sections.map((s) => (
          <div key={s}>
            <div className="text-c-orange font-medium mb-1"># {s}</div>
            {(content[s] || []).map((l, i) => <div key={i} className="text-text-muted">{l}</div>)}
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

function AnalyzePanel({ data }: { data: Record<string, unknown> }) {
  const affected = (data.affected as Array<{ name: string; deps: number; impact: string }>) || []
  return (
    <PanelShell title="Architecture Analysis" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>} meta={`${data.files_scanned} files scanned`}>
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-6">
          {[{ l: "Files Scanned", v: data.files_scanned }, { l: "Modules", v: data.modules }, { l: "Affected Files", v: data.affected_files }, { l: "Risk Level", v: data.risk_level }].map((s) => (
            <div key={s.l}><div className="text-2xl font-medium tracking-tight">{String(s.v)}</div><div className="text-[11px] text-text-muted mt-1">{s.l}</div></div>
          ))}
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-3">Affected Files</div>
          {affected.map((m) => (
            <div key={m.name} className="flex items-center justify-between py-2.5 text-[13px]">
              <div className="flex items-center gap-2 font-mono"><FileIcon />{m.name}</div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-text-muted">{m.deps} deps</span>
                <span className={`text-[11px] font-medium ${m.impact === "high" ? "text-[#D4380D]" : m.impact === "medium" ? "text-c-orange" : "text-text-muted"}`}>{m.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  )
}
function PlanPanel({ data }: { data: Record<string, unknown> }) {
  const planSteps = (data.steps as Array<{ num: number; title: string; file: string; description: string }>) || []
  return (
    <PanelShell title="Execution Plan" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} meta={data.approved ? <span className="text-[#22C55E]">✓ Approved</span> : undefined}>
      <div className="space-y-5">
        {planSteps.map((s) => (
          <div key={s.num} className="flex items-start gap-4">
            <div className="w-6 h-6 rounded-full bg-[#22C55E] text-white text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">{s.num}</div>
            <div>
              <div className="font-medium text-sm">{s.title}</div>
              <div className="font-mono text-xs text-text-muted mt-0.5 mb-1.5">{s.file}</div>
              <div className="text-[13px] text-text-muted leading-relaxed">{s.description}</div>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

function IndexPanel({ data }: { data: Record<string, unknown> }) {
  const modules = (data.modules as Array<{ module: string; files: number; symbols: number }>) || []
  return (
    <PanelShell title="Repository Index" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>} meta={`${data.total_symbols} symbols indexed`}>
      <div>
        <div className="grid grid-cols-[1fr_80px_80px] gap-2 pb-3 mb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted border-b border-[#F0E8D8]">
          <span>Module</span><span className="text-right">Files</span><span className="text-right">Symbols</span>
        </div>
        {modules.map((m) => (
          <div key={m.module} className="grid grid-cols-[1fr_80px_80px] gap-2 py-2.5 text-[13px]">
            <span className="font-mono">{m.module}/</span>
            <span className="text-right text-text-muted">{m.files}</span>
            <span className="text-right text-text-muted">{m.symbols}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}
function RefactorPanel({ data }: { data: Record<string, unknown> }) {
  const diff = (data.diff as Array<{ num: number; content: string; type?: string }>) || []
  return (
    <div className="flex flex-col gap-4 h-full">
      <PanelShell title={String(data.file || "Changes")} icon={<FileIcon />} meta={<><span className="text-[#22C55E]">+{String(data.added)}</span>{" "}<span className="text-[#EF4444]">-{String(data.removed)}</span></>}>
        <div className="font-mono text-[13px] leading-[1.7] -m-5 p-5">
          {diff.map((line, i) => (
            <div key={i} className="flex gap-4 mb-px">
              <span className="w-[30px] text-right text-[#CCC] select-none shrink-0">{line.num}</span>
              <span className={`w-full ${line.type === "added" ? "text-[#1D6E2F] bg-[#E6FFEC]" : line.type === "removed" ? "text-[#9E1D23] bg-[#FFEBE9]" : ""}`}>
                {line.type === "added" && "+ "}{line.type === "removed" && "- "}{line.content}
              </span>
            </div>
          ))}
        </div>
      </PanelShell>
      <div className="bg-[#1A1A1A] rounded-lg p-4 font-mono text-xs text-[#AAA] h-[180px] overflow-y-auto">
        <div className="mb-1"><span className="text-c-yellow mr-2">$</span><span className="text-[#DDD]">dispatch exec --file {String(data.file)}</span></div>
        <div className="mb-1">Applying changes...</div>
        <div className="mb-1"><span className="text-c-yellow mr-2">$</span><span className="text-[#DDD]">npm run lint</span></div>
        <div className="mb-1">Linting... <span className="text-[#22C55E]">0 errors</span></div>
      </div>
    </div>
  )
}

function TestPanel({ data }: { data: Record<string, unknown> }) {
  const tests = (data.tests as Array<{ name: string; time: string }>) || []
  return (
    <PanelShell title="Test Results" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} meta={<><span className="text-[#22C55E]">{String(data.passed)} passed</span><span className="text-text-muted ml-1.5">• {String(data.failed)} failed</span></>}>
      <div className="space-y-0.5">
        {tests.map((t, i) => (
          <div key={i} className="flex items-center justify-between py-2 text-[13px]">
            <div className="flex items-center gap-2.5">
              <span className="text-[#22C55E] text-xs">✓</span>
              <span className="font-mono">{t.name}</span>
            </div>
            <span className="text-xs text-text-muted font-mono">{t.time}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}
function PRPanel({ data }: { data: Record<string, unknown> }) {
  const files = (data.changed_files as Array<{ name: string; added: number; removed: number }>) || []
  return (
    <PanelShell title="Pull Request Preview" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></svg>} meta={`${data.branch} → ${data.target}`}>
      <div className="space-y-6">
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1.5">Title</div>
          <div className="font-medium">{String(data.title)}</div>
        </div>
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1.5">Description</div>
          <div className="text-[13px] text-text-muted leading-relaxed">{String(data.description)}</div>
        </div>
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-3">Changed Files</div>
          {files.map((f) => (
            <div key={f.name} className="flex items-center justify-between py-2 text-[13px]">
              <div className="flex items-center gap-2 font-mono"><FileIcon />{f.name}</div>
              <div className="text-xs font-mono"><span className="text-[#22C55E]">+{f.added}</span>{" "}<span className="text-[#EF4444]">-{f.removed}</span></div>
            </div>
          ))}
        </div>
      </div>
    </PanelShell>
  )
}

function CompletedPanel() {
  return (
    <div className="bg-white border border-[#E8D5B5] rounded-lg flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-[#22C55E] text-3xl mb-3">✓</div>
        <div className="text-lg font-medium mb-1">Task Complete</div>
        <div className="text-sm text-text-muted">All steps finished. Pull request is ready for review.</div>
      </div>
    </div>
  )
}

/* ─── Panel map ─── */
const panelMap: Record<string, React.FC<{ data: Record<string, unknown> }>> = {
  clone: ClonePanel, agents: AgentsPanel, analyze: AnalyzePanel,
  plan: PlanPanel, index: IndexPanel, refactor: RefactorPanel,
  test: TestPanel, pr: PRPanel,
}
export default function TaskView() {
  const { id } = useParams()
  const [meta, setMeta] = useState<TaskMeta>({ id: id || "", prompt: "", repo: "", branch: "" })
  const [steps, setSteps] = useState<Step[]>([])
  const [selectedStep, setSelectedStep] = useState("")
  const [stepData, setStepData] = useState<Record<string, Record<string, unknown>>>({})
  const [allDone, setAllDone] = useState(false)
  const [connected, setConnected] = useState(false)

  // Auto-select active step
  const autoSelect = useCallback((stepsArr: Step[]) => {
    const active = stepsArr.find(s => s.status === "active")
    if (active) setSelectedStep(active.id)
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
      if (!selectedStep && initSteps.length) setSelectedStep(initSteps[0].id)
    })

    es.addEventListener("step_update", (e) => {
      const payload = JSON.parse(e.data)
      setSteps(prev => {
        const next = prev.map(s =>
          s.id === payload.step_id
            ? { ...s, status: payload.status as StepStatus, detail: payload.detail }
            : s
        )
        autoSelect(next)
        return next
      })
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

    es.onerror = () => {
      es.close()
      setConnected(false)
    }

    return () => { es.close() }
  }, [id])
  // Resolve which panel to show
  const currentStep = steps.find(s => s.id === selectedStep)
  const currentData = stepData[selectedStep]

  function renderPanel() {
    if (!currentStep) return null
    if (currentStep.status === "wait") return <WaitingPanel />
    if (currentStep.status === "active") return <LoadingPanel label={currentStep.label} />
    // Done — show data panel
    if (allDone && selectedStep === steps[steps.length - 1]?.id) return <CompletedPanel />
    const Panel = panelMap[selectedStep]
    if (Panel && currentData) return <Panel data={currentData} />
    return <LoadingPanel label={currentStep.label} />
  }

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
                onClick={() => setSelectedStep(step.id)}
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
                <div className="flex items-center gap-2 text-[13px] text-[#22C55E]">
                  <span>✓</span> Complete
                </div>
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

          <div className="flex-1 min-h-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedStep + (currentStep?.status || "")}
                variants={panelFade}
                initial="hidden" animate="visible" exit="exit"
                className="h-full"
              >
                {renderPanel()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}