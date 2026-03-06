import { useState, useEffect, useRef } from "react"
import { useParams, Link } from "react-router"
import { motion, AnimatePresence } from "framer-motion"
import { Highlight, themes } from "prism-react-renderer"
import { apiFetch } from "../lib/api"

/* ─── Animation variants ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (d: number) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: d, ease: [0.16, 1, 0.3, 1] } }),
}
const streamIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

/* ─── Types ─── */
type AgentEvent = {
  id: number
  type: "task_init" | "tool_call" | "tool_result" | "agent_message" | "agent_error" | "task_complete"
  data: Record<string, unknown>
}
type TaskMeta = { id: string; prompt: string; repo: string; branch: string; compute: string }

/* ─── Language detection from file path ─── */
function getLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || ""
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", rb: "ruby",
    json: "json", yaml: "yaml", yml: "yaml", toml: "bash",
    md: "markdown", css: "css", scss: "css", html: "markup",
    sh: "bash", zsh: "bash", bash: "bash",
    sql: "sql", graphql: "graphql",
  }
  return map[ext] || "bash"
}

/* ─── Phase divider ─── */
function PhaseHeader({ label, status }: { label: string; status: "done" | "active" | "error" }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className={`w-1.5 h-1.5 rounded-full ${
        status === "done" ? "bg-[#22C55E]" : status === "error" ? "bg-[#EF4444]" : "bg-c-orange animate-[pulse_1.5s_infinite]"
      }`} />
      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-text-muted">{label}</span>
      <div className="flex-1 h-px bg-[#F0E8D8]" />
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

/* ─── Sidebar tool icon ─── */
function ToolIcon({ tool }: { tool: string }) {
  const cls = "w-3.5 h-3.5 opacity-50"
  if (tool === "read_file") return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
  if (tool === "edit_file") return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
  if (tool === "run_command") return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
  if (tool === "list_files") return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
  if (tool === "search_files") return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
  return <div className="w-3.5 h-3.5 rounded-full bg-[#DDD]" />
}

/* ═══════════════════════════════════════════════════
   Rich section renderers — design building blocks
═══════════════════════════════════════════════════ */

/* ─── Syntax-highlighted code block (doc-block style) ─── */
function CodeBlock({ path, content, error }: { path: string; content: string; error?: boolean }) {
  const [collapsed, setCollapsed] = useState(content.split("\n").length > 30)
  const lines = content.split("\n")
  const display = collapsed ? lines.slice(0, 30).join("\n") : content
  const lang = getLang(path)

  if (error) return (
    <div className="font-mono text-xs text-[#DC2626] bg-[#FFEBEB] border border-[#FCA5A5] rounded p-4">{content}</div>
  )

  return (
    <div className="bg-[#FAF8F5] border-l-[3px] border-c-orange rounded-r overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className="font-mono">{path}</span>
          <span className="text-[10px] px-1.5 py-px border border-[#F0E8D8] rounded text-text-muted">{lang}</span>
        </div>
        {lines.length > 30 && (
          <button onClick={() => setCollapsed(!collapsed)} className="font-mono text-[10px] text-c-orange cursor-pointer bg-transparent border-none hover:underline">
            {collapsed ? `show all (${lines.length} lines)` : "collapse"}
          </button>
        )}
      </div>
      <div className="max-h-[420px] overflow-y-auto overflow-x-hidden">
        <Highlight theme={themes.github} code={display} language={lang}>
          {({ tokens, getLineProps, getTokenProps }) => (
            <pre className="px-4 pb-4 font-mono text-[12px] leading-[1.7] m-0 bg-transparent whitespace-pre-wrap break-all overflow-wrap-anywhere">
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })} className="flex">
                  <span className="w-8 shrink-0 text-right pr-3 text-[#C0B8A8] select-none text-[11px]">{i + 1}</span>
                  <span className="min-w-0">
                    {line.map((token, k) => <span key={k} {...getTokenProps({ token })} />)}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )
}

/* ─── Module grid — for directory listings (compact) ─── */
function FileGrid({ path, content }: { path: string; content: string }) {
  const entries = content.split("\n").filter(Boolean)
  const dirs = entries.filter(f => f.endsWith("/"))
  const files = entries.filter(f => !f.endsWith("/"))

  // If lots of entries, show as compact module-grid style
  if (entries.length > 6) {
    // Group files by extension
    const groups: Record<string, string[]> = {}
    for (const f of files) {
      const ext = f.includes(".") ? f.split(".").pop()! : "other"
      ;(groups[ext] ||= []).push(f)
    }
    const sortedGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
    const maxCount = Math.max(...sortedGroups.map(([, v]) => v.length), 1)

    return (
      <div>
        {/* Dirs as top row */}
        {dirs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {dirs.map((d, i) => (
              <span key={i} className="font-mono text-[11px] bg-[#FFF8E1] border border-[#FDE68A] text-[#D97706] px-2 py-0.5 rounded">{d}</span>
            ))}
          </div>
        )}
        {/* Files as module cards */}
        <div className="grid grid-cols-2 gap-3">
          {sortedGroups.slice(0, 8).map(([ext, fileList]) => {
            const ratio = fileList.length / maxCount
            const filled = Math.max(1, Math.round(ratio * 4))
            return (
              <div key={ext} className="border border-[#F0E8D8] rounded p-3">
                <div className="flex justify-between mb-3">
                  <span className="text-[13px] font-medium">.{ext}</span>
                  <span className="font-mono text-[11px] text-text-muted">{fileList.length} file{fileList.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex gap-0.5 mb-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-sm ${i < filled ? (i === 0 ? "bg-c-orange" : "bg-c-yellow") : "bg-[#F0E8D8]"}`} />
                  ))}
                </div>
                <div className="font-mono text-[10px] text-text-muted truncate">
                  {fileList.slice(0, 3).join(", ")}{fileList.length > 3 ? ` +${fileList.length - 3}` : ""}
                </div>
              </div>
            )
          })}
        </div>
        {/* Summary metrics */}
        <div className="grid grid-cols-2 border border-[#F0E8D8] rounded mt-4">
          <div className="p-3 border-r border-[#F0E8D8]">
            <div className="text-[10px] uppercase text-text-muted tracking-[0.05em] mb-1">Directories</div>
            <div className="text-sm font-mono">{dirs.length}</div>
          </div>
          <div className="p-3">
            <div className="text-[10px] uppercase text-text-muted tracking-[0.05em] mb-1">Files</div>
            <div className="text-sm font-mono">{files.length}</div>
          </div>
        </div>
      </div>
    )
  }

  // Small list — simple data table
  return (
    <div>
      <div className="grid grid-cols-[1fr_80px] font-mono text-[10px] uppercase text-text-muted tracking-[0.05em] border-b border-[#F0E8D8] pb-2 mb-2">
        <div>Name</div><div className="text-right">Type</div>
      </div>
      {entries.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px] items-center py-1.5 border-b border-dashed border-[#F0E8D8] last:border-b-0 text-xs">
          <div className={`font-mono ${f.endsWith("/") ? "text-c-orange" : ""}`}>{f}</div>
          <div className="text-right">
            <span className={`inline-block px-1.5 py-px rounded text-[10px] font-medium border ${
              f.endsWith("/") ? "bg-[#FFF8E1] text-[#D97706] border-[#FDE68A]" : "bg-[#FAF8F5] text-text-muted border-[#F0E8D8]"
            }`}>{f.endsWith("/") ? "DIR" : "FILE"}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Edit confirmation — plan step style ─── */
function EditSection({ path, content }: { path: string; content: string }) {
  const isCreate = content.toLowerCase().startsWith("created")
  return (
    <div className="flex gap-4">
      <div className="font-mono text-lg text-c-orange font-light leading-none mt-0.5">
        {isCreate ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5500" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5500" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
        )}
      </div>
      <div>
        <div className="text-sm leading-[1.4] mb-2">{content}</div>
        <div className="flex gap-2 flex-wrap">
          <span className="font-mono text-[11px] bg-[#FAF8F5] border border-[#F0E8D8] px-2 py-0.5 rounded-full text-text-muted">{path}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Terminal panel — for run_command results ─── */
function TerminalPanel({ command, output, error }: { command: string; output: string; error?: boolean }) {
  const [collapsed, setCollapsed] = useState(output.split("\n").length > 40)
  const lines = output.split("\n")
  const display = collapsed ? lines.slice(0, 40).join("\n") : output
  const hasDiff = lines.some(l => l.startsWith("+") || l.startsWith("-"))

  return (
    <div className="bg-[#111] rounded-md overflow-hidden text-[#E5E5E5] -mx-1">
      <div className="flex items-center justify-between bg-[#1A1A1A] border-b border-[#333] px-4">
        <div className="py-2.5 text-xs font-mono text-c-orange truncate max-w-[80%]">
          {command.length > 100 ? command.slice(0, 100) + "..." : command}
        </div>
        {lines.length > 40 && (
          <button onClick={() => setCollapsed(!collapsed)} className="font-mono text-[10px] text-[#666] cursor-pointer bg-transparent border-none hover:text-[#AAA] shrink-0 ml-2">
            {collapsed ? `show all (${lines.length} lines)` : "collapse"}
          </button>
        )}
      </div>
      <div className="p-4 font-mono text-[13px] leading-[1.6] max-h-[400px] overflow-y-auto overflow-x-hidden">
        {hasDiff ? lines.filter(l => l.length > 0).map((line, i) => (
          <div key={i} className={`flex gap-4 ${
            line.startsWith("+") ? "text-[#4ADE80] bg-[rgba(74,222,128,0.1)]" :
            line.startsWith("-") ? "text-[#F87171] bg-[rgba(248,113,113,0.1)]" :
            "text-[#666]"
          }`}>
            <span className="shrink-0">{line.startsWith("+") ? "+" : line.startsWith("-") ? "-" : " "}</span>
            <span className="break-all">{(line.startsWith("+") || line.startsWith("-") ? line.slice(1) : line) || "\u00A0"}</span>
          </div>
        )) : (
          <pre className={`whitespace-pre-wrap break-all ${error ? "text-[#F87171]" : "text-[#CCC]"}`}>{display || "(no output)"}</pre>
        )}
      </div>
      <div className="px-4 py-3 bg-black border-t border-[#333] font-mono text-xs">
        <span className="text-c-orange">{">"}</span>
        <span className="ml-2 text-[#666]">dispatch exec</span>
        {!error && <span className="text-[#4ADE80] ml-2">Done.</span>}
        {error && <span className="text-[#F87171] ml-2">Failed.</span>}
      </div>
    </div>
  )
}

/* ─── Search results — data table with badges ─── */
function SearchSection({ pattern, content }: { pattern: string; content: string }) {
  const files = content.split("\n").filter(Boolean)
  const hasResults = !content.startsWith("No files")
  return (
    <div>
      <div className="grid grid-cols-[1fr_80px] font-mono text-[10px] uppercase text-text-muted tracking-[0.05em] border-b border-[#F0E8D8] pb-2 mb-2">
        <div>Matching files for "{pattern}"</div>
        <div className="text-right">{hasResults ? files.length : 0} hits</div>
      </div>
      {hasResults ? files.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px] items-center py-1.5 border-b border-dashed border-[#F0E8D8] last:border-b-0 text-xs">
          <div className="font-mono">{f}</div>
          <div className="text-right"><span className="inline-block px-1.5 py-px rounded text-[10px] font-medium bg-[#FFF8E1] text-[#D97706] border border-[#FDE68A]">MATCH</span></div>
        </div>
      )) : (
        <div className="py-4 text-sm text-text-muted">No files matching this pattern.</div>
      )}
    </div>
  )
}

/* ─── Agent message ─── */
function MessageBlock({ content, role }: { content: string; role: string }) {
  if (role === "system") return (
    <div className="font-mono text-xs text-text-muted py-1">{content}</div>
  )
  return (
    <div className="text-sm leading-[1.6] text-text whitespace-pre-wrap">{content}</div>
  )
}

/* ─── Error block ─── */
function ErrorBlock({ content }: { content: string }) {
  return (
    <div className="bg-[#FFEBEB] border border-[#FCA5A5] rounded-md p-4 font-mono text-xs text-[#DC2626]">{content}</div>
  )
}

/* ─── Completion — PR stats style with Create PR action ─── */
function CompletionBlock({ summary, iterations, tokens, taskId, repo, hasChanges }: {
  summary: string; iterations: number; tokens: number; taskId: string; repo: string; hasChanges: boolean
}) {
  const [prState, setPrState] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [prUrl, setPrUrl] = useState("")
  const [prError, setPrError] = useState("")

  const handleCreatePR = async () => {
    setPrState("loading")
    try {
      const res = await apiFetch(`/tasks/${taskId}/pr`, {
        method: "POST",
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok && data.pr_url) {
        setPrState("done")
        setPrUrl(data.pr_url)
      } else {
        setPrState("error")
        setPrError(data.detail || data.error || "PR creation failed")
      }
    } catch {
      setPrState("error")
      setPrError("Network error")
    }
  }

  const showPR = repo && repo !== "dispatch/core-agent" && hasChanges

  return (
    <div>
      <div className="font-mono text-[10px] text-c-orange uppercase tracking-wider mb-2">Task Summary</div>
      <div className="text-sm leading-[1.6] text-text whitespace-pre-wrap mb-6">{summary}</div>
      <div className="flex items-end justify-between pt-4 border-t border-[#F0E8D8]">
        <div className="flex gap-6 font-mono">
          <div className="flex flex-col gap-1">
            <span className="text-lg font-medium">{iterations}</span>
            <span className="text-[11px] uppercase text-text-muted">Iterations</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-lg font-medium">{tokens.toLocaleString()}</span>
            <span className="text-[11px] uppercase text-text-muted">Tokens</span>
          </div>
        </div>
        {showPR && (
          <div>
            {prState === "idle" && (
              <button
                onClick={handleCreatePR}
                className="h-9 px-5 bg-text text-bg border-none rounded-md font-mono text-xs font-medium cursor-pointer flex items-center gap-2.5 transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)] active:scale-[0.97]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
                  <path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
                </svg>
                Create Pull Request
              </button>
            )}
            {prState === "loading" && (
              <div className="flex items-center gap-2 font-mono text-xs text-text-muted">
                <div className="w-3.5 h-3.5 border-2 border-text border-t-transparent rounded-full animate-spin" />
                Creating PR...
              </div>
            )}
            {prState === "done" && (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 font-mono text-xs text-[#22C55E] no-underline hover:underline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                PR opened — view on GitHub
              </a>
            )}
            {prState === "error" && (
              <div className="flex flex-col items-end gap-1">
                <span className="font-mono text-[11px] text-[#DC2626]">{prError}</span>
                <button onClick={() => setPrState("idle")} className="font-mono text-[10px] text-text-muted bg-transparent border-none cursor-pointer hover:text-text">retry</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Render a single event ─── */
function EventRenderer({ event, taskId, repo, hasChanges }: { event: AgentEvent; taskId: string; repo: string; hasChanges: boolean }) {
  const d = event.data

  if (event.type === "agent_message") return <MessageBlock content={String(d.content || "")} role={String(d.role || "assistant")} />
  if (event.type === "agent_error") return <ErrorBlock content={String(d.content || "Unknown error")} />
  if (event.type === "tool_call") return null

  if (event.type === "tool_result") {
    const tool = String(d.tool || "")
    const output = String(d.output || "")
    const error = Boolean(d.error)
    const args = (d.args || {}) as Record<string, unknown>

    if (tool === "read_file") return <CodeBlock path={String(args.path || "")} content={output} error={error} />
    if (tool === "list_files") return <FileGrid path={String(args.path || ".")} content={output} />
    if (tool === "edit_file") return <EditSection path={String(args.path || "")} content={output} />
    if (tool === "run_command") return <TerminalPanel command={String(args.command || "")} output={output} error={error} />
    if (tool === "search_files") return <SearchSection pattern={String(args.pattern || "")} content={output} />
    return <div className="bg-[#FAF8F5] border-l-[3px] border-[#DDD] rounded-r p-4"><pre className="font-mono text-[12px] text-text-muted whitespace-pre-wrap max-h-[200px] overflow-y-auto">{output}</pre></div>
  }

  if (event.type === "task_complete") {
    return <CompletionBlock summary={String(d.summary || "")} iterations={Number(d.iterations || 0)} tokens={Number(d.total_tokens || 0)} taskId={taskId} repo={repo} hasChanges={hasChanges} />
  }

  return null
}

/* ─── Sidebar label ─── */
function eventLabel(e: AgentEvent): string {
  if (e.type === "agent_message") { const c = String(e.data.content || ""); return c.length > 40 ? c.slice(0, 40) + "..." : c }
  if (e.type === "tool_call") return String(e.data.tool || "tool")
  if (e.type === "agent_error") return "Error"
  if (e.type === "task_complete") return "Task Complete"
  return e.type
}

/* ════════════════════════════════════════════════
   Main TaskView
════════════════════════════════════════════════ */
export default function TaskView() {
  const { id } = useParams()
  const [meta, setMeta] = useState<TaskMeta>({ id: id || "", prompt: "", repo: "", branch: "", compute: "" })
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [allDone, setAllDone] = useState(false)
  const [connected, setConnected] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [steerInput, setSteerInput] = useState("")
  const [steerSending, setSteerSending] = useState(false)
  const [continuing, setContinuing] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const eventRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const eventCounter = useRef(0)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [events])

  useEffect(() => {
    if (!id) return
    const es = new EventSource(`/api/tasks/${id}/stream`)
    setConnected(true)

    const handleEvent = (type: AgentEvent["type"]) => (e: MessageEvent) => {
      const raw = JSON.parse(e.data)
      const eventId = ++eventCounter.current
      const event: AgentEvent = { id: eventId, type, data: raw }

      if (type === "task_init") {
        setMeta({ id: raw.id || id, prompt: raw.prompt || "", repo: raw.repo || "", branch: raw.branch || "", compute: raw.compute || "" })
        return
      }

      // Continuation: if we get tool_call/agent_message after completion, agent resumed
      if (type === "tool_call" || type === "agent_message") {
        setAllDone(false)
        setContinuing(false)
      }

      if (type === "tool_call") setIsThinking(true)
      if (type === "tool_result" || type === "agent_message") setIsThinking(false)

      // Track changes from edit_file results (for PR button)
      if (type === "tool_result" && raw.tool === "edit_file" && !raw.error) {
        setHasChanges(true)
      }

      // Don't close stream on completion — keep alive for continuation
      if (type === "task_complete") {
        setAllDone(true)
        setIsThinking(false)
      }

      setEvents(prev => [...prev, event])
      setSelectedIdx(eventId)
    }

    for (const t of ["task_init", "tool_call", "tool_result", "agent_message", "agent_error", "task_complete"] as const) {
      es.addEventListener(t, handleEvent(t))
    }
    // Also listen for diff event (for PR file reconstruction)
    es.addEventListener("task_diff", () => setHasChanges(true))

    es.onerror = () => { es.close(); setConnected(false) }
    return () => { es.close() }
  }, [id])

  // Steer — send follow-up message (works during execution AND after completion)
  const handleSteer = async () => {
    if (!steerInput.trim() || steerSending || !id) return
    const msg = steerInput.trim()
    setSteerSending(true)
    try {
      const res = await apiFetch(`/tasks/${id}/steer`, {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      })
      if (res.ok) {
        const data = await res.json()
        setSteerInput("")
        if (data.status === "continuing") {
          // Backend is running agent.continue_with() — new events will stream in
          setContinuing(true)
          setIsThinking(true)
        }
      }
    } catch { /* ignore */ }
    setSteerSending(false)
  }

  const scrollToEvent = (eventId: number) => {
    setSelectedIdx(eventId)
    eventRefs.current[eventId]?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const lastToolCall = [...events].reverse().find(e => e.type === "tool_call")
  const phaseLabel = continuing
    ? "CONTINUING"
    : allDone
    ? "COMPLETE"
    : lastToolCall
    ? String(lastToolCall.data.tool || "").toUpperCase().replace("_", " ")
    : "INITIALIZING"

  const sidebarEvents = events.filter(e => e.type === "tool_call" || e.type === "agent_message" || e.type === "agent_error" || e.type === "task_complete")

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="grid-bg fixed inset-0 z-0" />

      <nav className="relative z-10 flex justify-between items-center h-12 px-12 max-w-[1344px] mx-auto">
        <Link to="/dashboard" className="font-mono text-sm font-medium text-text no-underline flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
          <div className="w-4 h-4 bg-c-orange grid grid-cols-2 grid-rows-2 gap-px p-px"><div className="bg-bg opacity-0" /><div className="bg-bg" /><div className="bg-bg" /><div className="bg-bg" /></div>
          Dispatch
        </Link>
        <Link to="/dashboard" className="font-mono text-xs text-text-muted no-underline hover:text-text transition-colors">Dashboard</Link>
      </nav>

      <div className="max-w-[1344px] mx-auto mt-4 px-12 grid grid-cols-[320px_1fr] gap-8 relative z-10">
        {/* Sidebar */}
        <motion.aside className="bg-[#FFFDF8] border border-[#E8D5B5] rounded-lg flex flex-col h-[calc(100vh-80px)]" variants={fadeUp} custom={0.1} initial="hidden" animate="visible">
          <div className="px-5 py-5 border-b border-[#F0E8D8]">
            <h2 className="text-xs font-medium uppercase tracking-[0.05em] text-text-muted">Agent Activity</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {sidebarEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => scrollToEvent(event.id)}
                className={`w-full flex gap-3 px-3 py-2.5 rounded-md mb-0.5 text-[12px] leading-relaxed transition-all duration-200 text-left cursor-pointer border-none ${
                  selectedIdx === event.id ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "bg-transparent hover:bg-[#FFFBF5]"
                }`}
              >
                {event.type === "tool_call" ? <div className="mt-[3px] shrink-0"><ToolIcon tool={String(event.data.tool)} /></div>
                 : event.type === "task_complete" ? <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#22C55E]" />
                 : event.type === "agent_error" ? <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#EF4444]" />
                 : <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-c-orange" />}
                <div className="min-w-0">
                  <div className="font-medium truncate">{event.type === "tool_call" ? String(event.data.tool) : eventLabel(event)}</div>
                  {event.type === "tool_call" && (
                    <div className="text-[11px] mt-0.5 text-text-muted truncate">
                      {(() => { const args = (event.data.args || {}) as Record<string, unknown>; const v = Object.values(args).find(v => typeof v === "string" && (v as string).length < 50); return v ? String(v) : "" })()}
                    </div>
                  )}
                </div>
              </button>
            ))}
            {(isThinking && !allDone || continuing) && (
              <div className="flex items-center gap-3 px-3 py-2.5 text-[12px] text-text-muted">
                <div className="w-2 h-2 rounded-full bg-c-orange animate-[pulse_1.5s_infinite]" /><span>{continuing ? "Continuing..." : "Working..."}</span>
              </div>
            )}
          </div>
        </motion.aside>

        {/* Main */}
        <main className="flex flex-col gap-6 h-[calc(100vh-80px)] min-w-0">
          {/* Header — metrics grid style */}
          <motion.div className="bg-white border border-[#E8D5B5] rounded-lg overflow-hidden shrink-0" variants={fadeUp} custom={0.15} initial="hidden" animate="visible">
            <div className="px-6 py-4 flex justify-between items-center">
              <h1 className="text-lg font-medium">{meta.prompt || "Loading..."}</h1>
              <div className="flex items-center gap-5">
                {continuing ? <div className="flex items-center gap-2 text-[13px] text-text-muted"><div className="w-1.5 h-1.5 rounded-full bg-c-orange animate-[pulse_1.5s_infinite]" />Continuing</div>
                 : allDone ? <div className="flex items-center gap-2 text-[13px] text-[#22C55E]"><span>✓</span> Complete</div>
                 : connected ? <div className="flex items-center gap-2 text-[13px] text-text-muted"><div className="w-1.5 h-1.5 rounded-full bg-c-orange animate-[pulse_1.5s_infinite]" />Executing</div>
                 : <div className="text-[13px] text-text-muted">Disconnected</div>}
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-[#F0E8D8]">
              <div className="p-3 px-6 border-r border-[#F0E8D8]">
                <div className="text-[10px] uppercase text-text-muted tracking-[0.05em] mb-1">Task ID</div>
                <div className="text-[13px] font-mono">{meta.id}</div>
              </div>
              <div className="p-3 px-6 border-r border-[#F0E8D8]">
                <div className="text-[10px] uppercase text-text-muted tracking-[0.05em] mb-1">Repository</div>
                <div className="text-[13px] font-mono">{meta.repo || "—"}</div>
              </div>
              <div className="p-3 px-6">
                <div className="text-[10px] uppercase text-text-muted tracking-[0.05em] mb-1">Compute</div>
                <div className="text-[13px] font-mono">{meta.compute || "—"}</div>
              </div>
            </div>
          </motion.div>

          {/* Streaming content panel */}
          <motion.div className="bg-white border border-[#E8D5B5] rounded-lg flex-1 min-h-0 overflow-hidden flex flex-col" variants={fadeUp} custom={0.2} initial="hidden" animate="visible">
            <div className="px-5 py-3 border-b border-[#F0E8D8] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3 font-mono">
                <div className={`w-2 h-2 rounded-full ${allDone && !continuing ? "bg-[#22C55E]" : "bg-c-orange animate-[pulse_1.5s_infinite]"}`} />
                <span className="text-[11px] uppercase tracking-[0.05em] text-text-muted">
                  Phase // <span className="font-semibold text-text">{phaseLabel}</span>
                </span>
              </div>
              <span className="font-mono text-[11px] text-text-muted">{events.filter(e => e.type === "tool_call").length} tool calls</span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-5 min-w-0">
              <AnimatePresence>
                {events.map((event) => {
                  if (event.type === "tool_call") {
                    const tool = String(event.data.tool || "tool")
                    const args = (event.data.args || {}) as Record<string, unknown>
                    const detail = Object.values(args).find(v => typeof v === "string" && (v as string).length < 60) || ""
                    return (
                      <motion.div key={event.id} ref={(el) => { eventRefs.current[event.id] = el }} {...streamIn}>
                        <PhaseHeader label={`${tool.replace("_", " ")}${detail ? ` — ${detail}` : ""}`} status="active" />
                      </motion.div>
                    )
                  }
                  const showDivider = event.type === "task_complete" || event.type === "agent_error"
                  return (
                    <motion.div key={event.id} ref={(el) => { eventRefs.current[event.id] = el }} {...streamIn}>
                      {showDivider && <PhaseHeader label={event.type === "task_complete" ? "Complete" : "Error"} status={event.type === "task_complete" ? "done" : "error"} />}
                      <EventRenderer event={event} taskId={meta.id} repo={meta.repo} hasChanges={hasChanges} />
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {(isThinking && !allDone || continuing) && <motion.div {...streamIn} key="loader"><ActiveLoader /></motion.div>}
              {allDone && !continuing && (
                <motion.div {...streamIn} className="pt-4 border-t border-[#F0E8D8]">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[#22C55E]">Task completed</span>
                    <div className="flex-1 h-px bg-[#F0E8D8]" />
                  </div>
                </motion.div>
              )}
            </div>

            {/* Steer / continue input — always visible when connected */}
            {connected && (
              <div className="px-5 py-3 border-t border-[#F0E8D8] shrink-0">
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={steerInput}
                    onChange={(e) => setSteerInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSteer() } }}
                    placeholder={allDone ? "Send a follow-up instruction..." : "Steer the agent..."}
                    disabled={steerSending || continuing}
                    className="flex-1 bg-transparent border-none outline-none font-mono text-[13px] text-text placeholder:text-[#C0B8A8] disabled:opacity-50"
                  />
                  <button
                    onClick={handleSteer}
                    disabled={!steerInput.trim() || steerSending || continuing}
                    className="w-8 h-8 bg-text border-none rounded-md flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-[1.08] active:scale-[0.94] disabled:opacity-20 disabled:cursor-default disabled:hover:scale-100 shrink-0"
                  >
                    {steerSending || continuing ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
