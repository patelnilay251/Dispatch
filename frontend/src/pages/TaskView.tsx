import { useState, useEffect, useRef } from "react"
import { useParams, useLocation } from "react-router"
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

type StepStatus = "wait" | "active" | "done"
type Step = { id: string; label: string; duration: number; status: StepStatus; detail: string }

const initialSteps: Step[] = [
  { id: "clone", label: "Cloning Repository", duration: 2500, status: "wait", detail: "" },
  { id: "agents", label: "Reading AGENTS.md", duration: 1500, status: "wait", detail: "" },
  { id: "analyze", label: "Analyzing Architecture", duration: 3000, status: "wait", detail: "" },
  { id: "plan", label: "Planning Execution", duration: 2000, status: "wait", detail: "" },
  { id: "index", label: "Indexing Repository", duration: 2000, status: "wait", detail: "" },
  { id: "refactor", label: "Applying Changes", duration: 3500, status: "wait", detail: "" },
  { id: "test", label: "Running Unit Tests", duration: 2500, status: "wait", detail: "" },
  { id: "pr", label: "Generating Pull Request", duration: 2000, status: "wait", detail: "" },
]

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "done") return <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#22C55E]" />
  if (status === "active") return <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-c-orange animate-[pulse_1.5s_infinite]" />
  return <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#DDD]" />
}

function timeAgo(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
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

/* ─── Loading skeleton ─── */
function LoadingPanel({ label }: { label: string }) {
  return (
    <PanelShell title={label} icon={<div className="w-3 h-3 rounded-full bg-c-orange animate-[pulse_1.5s_infinite]" />}>
      <div className="space-y-4 animate-pulse">
        <div className="h-3 bg-[#F0E8D8] rounded w-3/4" />
        <div className="h-3 bg-[#F0E8D8] rounded w-1/2" />
        <div className="h-3 bg-[#F0E8D8] rounded w-5/6" />
        <div className="h-3 bg-[#F0E8D8] rounded w-2/3" />
        <div className="h-3 bg-[#F0E8D8] rounded w-3/5" />
      </div>
    </PanelShell>
  )
}

/* ─── Waiting panel ─── */
function WaitingPanel() {
  return (
    <div className="bg-white border border-[#E8D5B5] rounded-lg flex items-center justify-center h-full">
      <div className="text-sm text-text-muted">Waiting for previous steps to complete...</div>
    </div>
  )
}
/* ─── Completed Panels ─── */
function ClonePanel() {
  return (
    <PanelShell title="Clone — dispatch/core-agent" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>}>
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-8">
          {[{ label: "Repository", value: "dispatch/core-agent" }, { label: "Branch", value: "main → feat/tenant-auth" }, { label: "Commit", value: "a3f8c12" }].map((item) => (
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
            <div className="h-full bg-[#22C55E] rounded-full" style={{ width: "100%" }} />
          </div>
          <div className="flex justify-between mt-3 text-xs text-text-muted">
            <span>142 files • 18 directories</span>
            <span>2.4 MB in 3.2s</span>
          </div>
        </div>
      </div>
    </PanelShell>
  )
}

function AgentsPanel() {
  return (
    <PanelShell title="AGENTS.md" icon={<FileIcon />} meta="Project root">
      <div className="font-mono text-[13px] leading-[1.8] space-y-5">
        {[
          { heading: "# Project Context", lines: ["Multi-tenant SaaS platform built with Next.js 14, TypeScript, and Prisma ORM."] },
          { heading: "# Coding Standards", lines: ["- Strict TypeScript, no `any` types", "- Functional components with hooks", "- Zod schemas for all API inputs", "- Minimum 80% test coverage"] },
          { heading: "# Architecture", lines: ["- Auth: src/middleware.ts + src/lib/auth/", "- API routes: src/app/api/", "- Database: Prisma with PostgreSQL"] },
          { heading: "# Testing", lines: ["- Vitest for unit tests, Playwright for e2e", "- Run: `npm run test`"] },
        ].map((s) => (
          <div key={s.heading}>
            <div className="text-c-orange font-medium mb-1">{s.heading}</div>
            {s.lines.map((l, i) => <div key={i} className="text-text-muted">{l}</div>)}
          </div>
        ))}
      </div>
    </PanelShell>
  )
}
function AnalyzePanel() {
  const modules = [
    { name: "src/middleware.ts", deps: 4, impact: "high" },
    { name: "src/lib/auth/session.ts", deps: 3, impact: "high" },
    { name: "src/lib/auth/tenant.ts", deps: 1, impact: "medium" },
    { name: "src/app/api/auth/[...nextauth]/route.ts", deps: 2, impact: "medium" },
    { name: "src/lib/db/prisma.ts", deps: 0, impact: "low" },
    { name: "src/types/auth.d.ts", deps: 0, impact: "low" },
  ]
  return (
    <PanelShell title="Architecture Analysis" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>} meta="142 files scanned">
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-6">
          {[{ l: "Files Scanned", v: "142" }, { l: "Modules", v: "18" }, { l: "Affected Files", v: "4" }, { l: "Risk Level", v: "Medium" }].map((s) => (
            <div key={s.l}><div className="text-2xl font-medium tracking-tight">{s.v}</div><div className="text-[11px] text-text-muted mt-1">{s.l}</div></div>
          ))}
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-3">Affected Files</div>
          {modules.map((m) => (
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
function PlanPanel() {
  return (
    <PanelShell title="Execution Plan" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} meta={<span className="text-[#22C55E]">✓ Approved</span>}>
      <div className="space-y-5">
        {[
          { n: 1, t: "Add tenant ID extraction to middleware", f: "src/middleware.ts", d: "Extract x-tenant-id header, pass to session resolver, add redirect for missing tenant on protected routes." },
          { n: 2, t: "Create tenant validation helper", f: "src/lib/auth/tenant.ts", d: "New utility to validate tenant ID against database, cache valid tenants for 5 minutes." },
          { n: 3, t: "Update session types for multi-tenancy", f: "src/types/auth.d.ts", d: "Extend Session interface with tenantId field, update NextAuth config types." },
        ].map((s) => (
          <div key={s.n} className="flex items-start gap-4">
            <div className="w-6 h-6 rounded-full bg-[#22C55E] text-white text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">{s.n}</div>
            <div>
              <div className="font-medium text-sm">{s.t}</div>
              <div className="font-mono text-xs text-text-muted mt-0.5 mb-1.5">{s.f}</div>
              <div className="text-[13px] text-text-muted leading-relaxed">{s.d}</div>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

function IndexPanel() {
  const indexed = [
    { module: "auth", files: 8, symbols: 42 }, { module: "api/routes", files: 24, symbols: 156 },
    { module: "lib/db", files: 6, symbols: 31 }, { module: "middleware", files: 2, symbols: 12 },
    { module: "types", files: 14, symbols: 87 }, { module: "components", files: 48, symbols: 203 },
    { module: "utils", files: 12, symbols: 64 }, { module: "config", files: 4, symbols: 18 },
  ]
  return (
    <PanelShell title="Repository Index" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>} meta="613 symbols indexed">
      <div>
        <div className="grid grid-cols-[1fr_80px_80px] gap-2 pb-3 mb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted border-b border-[#F0E8D8]">
          <span>Module</span><span className="text-right">Files</span><span className="text-right">Symbols</span>
        </div>
        {indexed.map((m) => (
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
function RefactorPanel() {
  const diffLines = [
    { num: 12, content: "export async function middleware(req: NextRequest) {" },
    { num: 13, content: "  const session = await getSession(req);", type: "removed" as const },
    { num: 14, content: "  const tenantId = req.headers.get('x-tenant-id');", type: "added" as const },
    { num: 15, content: "  const session = await getSession(req, { tenantId });", type: "added" as const },
    { num: 16, content: "" },
    { num: 17, content: "  if (!tenantId && !isPublicRoute(req)) {", type: "added" as const },
    { num: 18, content: "    return NextResponse.redirect('/select-tenant');", type: "added" as const },
    { num: 19, content: "  }", type: "added" as const },
    { num: 20, content: "" },
    { num: 21, content: "  return NextResponse.next();" },
  ]
  return (
    <div className="flex flex-col gap-4 h-full">
      <PanelShell title="src/middleware.ts" icon={<FileIcon />} meta={<><span className="text-[#22C55E]">+24</span>{" "}<span className="text-[#EF4444]">-12</span></>}>
        <div className="font-mono text-[13px] leading-[1.7] -m-5 p-5">
          {diffLines.map((line, i) => (
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
        <div className="mb-1"><span className="text-c-yellow mr-2">$</span><span className="text-[#DDD]">dispatch exec step-1 --file src/middleware.ts</span></div>
        <div className="mb-1">Applying changes to src/middleware.ts...</div>
        <div className="mb-1"><span className="text-c-yellow mr-2">$</span><span className="text-[#DDD]">npm run lint</span></div>
        <div className="mb-1">Linting src/middleware.ts... <span className="text-[#22C55E]">0 errors</span></div>
        <div className="mb-1"><span className="text-c-yellow mr-2">$</span><span className="animate-pulse text-[#DDD]">_</span></div>
      </div>
    </div>
  )
}

function TestPanel() {
  const tests = [
    { name: "middleware › extracts tenant ID from headers", time: "12ms" },
    { name: "middleware › redirects when tenant ID missing", time: "8ms" },
    { name: "middleware › passes through public routes", time: "5ms" },
    { name: "middleware › attaches tenant to session", time: "15ms" },
    { name: "tenant › validates tenant against database", time: "42ms" },
    { name: "tenant › caches valid tenants", time: "3ms" },
    { name: "tenant › rejects invalid tenant IDs", time: "6ms" },
    { name: "types › Session includes tenantId field", time: "2ms" },
  ]
  return (
    <PanelShell title="Test Results" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} meta={<><span className="text-[#22C55E]">8 passed</span><span className="text-text-muted ml-1.5">• 0 failed</span></>}>
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
function PRPanel() {
  const changedFiles = [
    { name: "src/middleware.ts", added: 24, removed: 12 },
    { name: "src/lib/auth/tenant.ts", added: 48, removed: 0 },
    { name: "src/types/auth.d.ts", added: 8, removed: 2 },
    { name: "src/lib/auth/session.ts", added: 6, removed: 3 },
  ]
  return (
    <PanelShell title="Pull Request Preview" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></svg>} meta="feat/tenant-auth → main">
      <div className="space-y-6">
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1.5">Title</div>
          <div className="font-medium">feat: add multi-tenant support to auth middleware</div>
        </div>
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-1.5">Description</div>
          <div className="text-[13px] text-text-muted leading-relaxed space-y-2">
            <p>Adds multi-tenant authentication support by extracting tenant ID from request headers and passing it through the session resolver.</p>
            <p>Changes include a new tenant validation helper with 5-minute caching, updated middleware to redirect unauthenticated tenant requests, and extended session types.</p>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider mb-3">Changed Files</div>
          {changedFiles.map((f) => (
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

/* ─── Completed panel ─── */
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
const completedPanels: Record<string, () => JSX.Element> = {
  clone: ClonePanel, agents: AgentsPanel, analyze: AnalyzePanel,
  plan: PlanPanel, index: IndexPanel, refactor: RefactorPanel,
  test: TestPanel, pr: PRPanel,
}

function StepContent({ stepId, status, label }: { stepId: string; status: StepStatus; label: string }) {
  if (status === "wait") return <WaitingPanel />
  if (status === "active") return <LoadingPanel label={label} />
  const Panel = completedPanels[stepId]
  return Panel ? <Panel /> : null
}

export default function TaskView() {
  const { id } = useParams()
  const location = useLocation()
  const state = location.state as { prompt?: string; repo?: string } | null
  const prompt = state?.prompt || "Refactor auth middleware for multi-tenant support"
  const repo = state?.repo || "dispatch/core-agent"

  const [steps, setSteps] = useState<Step[]>(initialSteps)
  const [selectedStep, setSelectedStep] = useState(initialSteps[0].id)
  const [allDone, setAllDone] = useState(false)
  const startTime = useRef(Date.now())
  // Auto-progression engine
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      for (let i = 0; i < initialSteps.length; i++) {
        if (cancelled) return

        // Set current step to active, auto-select it
        setSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx < i ? "done" : idx === i ? "active" : "wait",
          detail: idx < i ? `Completed ${timeAgo(Date.now() - startTime.current)}` : idx === i ? "In progress..." : "",
        })))
        setSelectedStep(initialSteps[i].id)

        // Wait for step duration
        await new Promise(r => setTimeout(r, initialSteps[i].duration))
        if (cancelled) return

        // Mark step as done
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "done" as StepStatus, detail: `Completed ${timeAgo(Date.now() - startTime.current)}` } : s))
      }
      setAllDone(true)
    }
    run()
    return () => { cancelled = true }
  }, [])

  // Keep detail times updated
  useEffect(() => {
    const interval = setInterval(() => {
      setSteps(prev => prev.map(s => s.status === "done" ? { ...s, detail: `Completed ${timeAgo(Date.now() - startTime.current)}` } : s))
    }, 10000)
    return () => clearInterval(interval)
  }, [])
  const currentStep = steps.find(s => s.id === selectedStep)

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
                    {step.status === "active" ? "In progress..." : step.status === "wait" ? "Queued" : step.detail}
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
              <h1 className="text-lg font-medium mb-1">{prompt}</h1>
              <div className="text-[13px] text-text-muted flex gap-4">
                <span>ID: <code className="font-mono">{id}</code></span>
                <span>Repo: <code className="font-mono">{repo}</code></span>
                <span>Branch: <code className="font-mono">feat/tenant-auth</code></span>
              </div>
            </div>
            <div className="flex items-center gap-5">
              {allDone ? (
                <div className="flex items-center gap-2 text-[13px] text-[#22C55E]">
                  <span>✓</span> Complete
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[13px] text-text-muted">
                  <div className="w-1.5 h-1.5 rounded-full bg-c-orange animate-[pulse_1.5s_infinite]" />
                  Executing
                </div>
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
                {allDone && selectedStep === "pr" ? (
                  <CompletedPanel />
                ) : currentStep ? (
                  <StepContent stepId={currentStep.id} status={currentStep.status} label={currentStep.label} />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}