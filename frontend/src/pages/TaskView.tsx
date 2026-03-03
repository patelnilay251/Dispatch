import { motion } from "framer-motion"

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] },
  }),
}

const steps = [
  { label: "Cloning Repository", detail: "Completed 4m ago", status: "done" as const },
  { label: "Reading AGENTS.md", detail: "Completed 4m ago", status: "done" as const },
  { label: "Analyzing Architecture", detail: "Completed 3m ago", status: "done" as const },
  { label: "Planning — 3 steps", detail: "Approved 2m ago", status: "done" as const },
  { label: "Indexing Repository", detail: "Completed 1m ago", status: "done" as const },
  { label: "Refactoring middleware.ts", detail: "Current Step — 82%", status: "active" as const },
  { label: "Running Unit Tests", detail: "Queued", status: "wait" as const },
  { label: "Generating Pull Request", detail: "Queued", status: "wait" as const },
]

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
const termLines = [
  { prompt: true, text: "dispatch clone dispatch/core-agent" },
  { text: "Cloning into '/sandbox/core-agent'... done." },
  { prompt: true, text: "dispatch analyze --read-agents-md" },
  { text: "Found AGENTS.md — loading project context." },
  { text: "Scanning 142 files across 18 modules." },
  { prompt: true, text: "dispatch plan --task DSP-8120" },
  { text: "Plan generated: 3 steps, 4 affected files." },
  { text: "Awaiting approval...", accent: true },
  { text: "✓ Plan approved by user.", success: true },
  { prompt: true, text: "dispatch exec step-1 --file src/middleware.ts" },
  { text: "Applying changes to src/middleware.ts..." },
  { prompt: true, text: "npm run lint" },
  { text: "Linting src/middleware.ts..." },
  { prompt: true, text: "_", cursor: true },
]

function StatusDot({ status }: { status: "done" | "active" | "wait" }) {
  const base = "w-2 h-2 rounded-full mt-[5px] shrink-0"
  if (status === "done") return <div className={`${base} bg-[#22C55E]`} />
  if (status === "active")
    return <div className={`${base} bg-c-orange animate-[pulse_1.5s_infinite]`} />
  return <div className={`${base} bg-[#DDD]`} />
}
export default function TaskView() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="grid-bg fixed inset-0 z-0" />

      <div className="max-w-[1344px] mx-auto mt-10 px-12 grid grid-cols-[320px_1fr] gap-8 relative z-10">
        {/* Sidebar */}
        <motion.aside
          className="bg-white border border-[#E8D5B5] rounded-lg flex flex-col h-[calc(100vh-120px)] shadow-[0_4px_24px_rgba(0,0,0,0.02)]"
          variants={fadeUp}
          custom={0.1}
          initial="hidden"
          animate="visible"
        >
          <div className="px-5 py-5 border-b border-[#F0F0F0]">
            <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-text-muted">
              Execution Logs
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`flex gap-3 px-3 py-3 rounded-md mb-1 text-[13px] leading-relaxed transition-colors duration-200 ${
                  step.status === "active"
                    ? "bg-[#FFF3E0] border-l-[3px] border-c-orange"
                    : "hover:bg-[#FAF9F6]"
                }`}
              >
                <StatusDot status={step.status} />
                <div>
                  <div className={`font-medium ${step.status === "wait" ? "text-[#AAA]" : ""}`}>
                    {step.label}
                  </div>
                  <div className={`text-[11px] ${step.status === "wait" ? "text-[#BBB]" : "text-text-muted"}`}>
                    {step.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.aside>
        {/* Main View */}
        <main className="flex flex-col gap-6">
          {/* Header Card */}
          <motion.div
            className="bg-white border border-[#E8D5B5] rounded-lg px-6 py-5 flex justify-between items-center"
            variants={fadeUp}
            custom={0.15}
            initial="hidden"
            animate="visible"
          >
            <div>
              <h1 className="text-xl font-medium mb-1">
                Refactor auth middleware for multi-tenant support
              </h1>
              <div className="text-sm text-text-muted flex gap-4">
                <span>ID: <code className="font-mono text-[13px]">DSP-8120</code></span>
                <span>Repo: <code className="font-mono text-[13px]">dispatch/core-agent</code></span>
                <span>Branch: <code className="font-mono text-[13px]">feat/tenant-auth</code></span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-[#FFF3E0] text-c-orange rounded-full text-xs font-semibold">
                Executing
              </span>
              <button className="px-4 py-2.5 border border-[#E8D5B5] bg-white rounded text-[13px] font-medium cursor-pointer hover:bg-[#FAF9F6] transition-colors">
                Pause Agent
              </button>
            </div>
          </motion.div>
          {/* Panels */}
          <div className="grid grid-rows-[1fr_240px] gap-6 h-[calc(100vh-300px)]">
            {/* Diff View */}
            <motion.div
              className="bg-white border border-[#E8D5B5] rounded-lg flex flex-col overflow-hidden"
              variants={fadeUp}
              custom={0.2}
              initial="hidden"
              animate="visible"
            >
              <div className="px-5 py-3 bg-[#FAF9F6] border-b border-[#F0F0F0] flex justify-between items-center">
                <div className="text-[13px] font-medium flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  src/middleware.ts
                </div>
                <div className="text-xs text-text-muted">
                  <span className="text-[#22C55E]">+24</span>{" "}
                  <span className="text-[#EF4444]">-12</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto font-mono text-[13px] p-5 leading-[1.6] bg-[#FAFAFA]">
                {diffLines.map((line, i) => (
                  <div key={i} className="flex gap-4 mb-0.5">
                    <span className="w-[30px] text-right text-[#BBB] select-none shrink-0">
                      {line.num}
                    </span>
                    <span
                      className={`w-full ${
                        line.type === "added"
                          ? "bg-[#E6FFEC] text-[#1D6E2F]"
                          : line.type === "removed"
                          ? "bg-[#FFEBE9] text-[#9E1D23]"
                          : ""
                      }`}
                    >
                      {line.type === "added" && "+ "}
                      {line.type === "removed" && "- "}
                      {line.content}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
            {/* Terminal */}
            <motion.div
              className="bg-[#1A1A1A] rounded-lg p-4 font-mono text-xs text-[#DDD] overflow-y-auto shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]"
              variants={fadeUp}
              custom={0.25}
              initial="hidden"
              animate="visible"
            >
              {termLines.map((line, i) => (
                <div key={i} className={`mb-1 ${line.cursor ? "animate-pulse" : ""}`}>
                  {line.prompt && <span className="text-c-yellow mr-2">$</span>}
                  <span
                    className={
                      line.success
                        ? "text-[#22C55E]"
                        : line.accent
                        ? "text-c-orange"
                        : ""
                    }
                  >
                    {line.text}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Steer Input */}
          <motion.div
            className="bg-white border border-[#E8D5B5] rounded-lg px-5 py-3 flex items-center gap-3"
            variants={fadeUp}
            custom={0.3}
            initial="hidden"
            animate="visible"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <input
              type="text"
              placeholder="Steer the agent — ask a question or adjust the approach..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-text placeholder:text-[#A0A0A0] font-[inherit]"
            />
            <button className="w-8 h-8 bg-text rounded-md flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-[1.08] active:scale-95">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </motion.div>
        </main>
      </div>
    </div>
  )
}