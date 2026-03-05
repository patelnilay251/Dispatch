import { useState, useEffect, useRef } from "react"
import { useParams, Link } from "react-router"
import { motion, AnimatePresence } from "framer-motion"

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

/* ─── Sidebar icon for tool type ─── */
function ToolIcon({ tool }: { tool: string }) {
  const cls = "w-3.5 h-3.5 opacity-50"
  if (tool === "read_file") return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  )
  if (tool === "edit_file") return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
  if (tool === "run_command") return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
  if (tool === "list_files") return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
  if (tool === "search_files") return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
  return <div className="w-3.5 h-3.5 rounded-full bg-[#DDD]" />
}

/* ─────────────────────────────────────────────────
   Event renderers — these replace the old section components.
   Same design vocabulary, but driven by real agent events.
───────────────────────────────────────────────── */

/* ─── Tool call: read_file result → file content block ─── */
function FileContentBlock({ path, content, error }: { path: string; content: string; error?: boolean }) {
  const [collapsed, setCollapsed] = useState(content.length > 800)
  const display = collapsed ? content.slice(0, 800) + "\n..." : content

  if (error) return (
    <div className="font-mono text-xs text-[#EF4444] bg-[#FEF2F2] border border-[#FCA5A5] rounded p-3">{content}</div>
  )
  return (
    <div className="bg-[#FAF8F5] border-l-[3px] border-c-orange rounded-r overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="font-mono">{path}</span>
        </div>
        {content.length > 800 && (
          <button onClick={() => setCollapsed(!collapsed)} className="font-mono text-[10px] text-c-orange cursor-pointer bg-transparent border-none hover:underline">
            {collapsed ? "expand" : "collapse"}
          </button>
        )}
      </div>
      <pre className="px-4 pb-3 font-mono text-[12px] leading-[1.6] text-text overflow-x-auto whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">{display}</pre>
    </div>
  )
}

/* ─── Tool call: list_files result → file tree ─── */
function FileListBlock({ path, content }: { path: string; content: string }) {
  const files = content.split("\n").filter(Boolean)
  return (
    <div className="font-mono text-[12px] leading-[1.8]">
      <span className="text-text-muted text-[11px]">{path}/</span>
      {files.map((f, i) => (
        <div key={i} className="pl-3">
          <span className={f.endsWith("/") ? "text-c-orange" : "text-text"}>{f}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── Tool call: edit_file result → edit confirmation ─── */
function EditBlock({ path, content }: { path: string; content: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[13px]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span className="text-[#22C55E]">{content}</span>
      <span className="text-text-muted text-[11px] ml-1">→ {path}</span>
    </div>
  )
}

/* ─── Tool call: run_command result → dark terminal panel ─── */
function TerminalBlock({ command, output, error, exitCode }: {
  command: string; output: string; error?: boolean; exitCode?: number
}) {
  const [collapsed, setCollapsed] = useState(output.length > 1500)
  const display = collapsed ? output.slice(0, 1500) + "\n..." : output

  return (
    <div className="bg-[#111] rounded-md overflow-hidden text-[#E5E5E5] -mx-1">
      <div className="flex items-center justify-between bg-[#1A1A1A] border-b border-[#333] px-4">
        <div className="py-2.5 text-xs font-mono text-c-orange flex items-center gap-2">
          <span className="text-[#666]">$</span> {command.length > 80 ? command.slice(0, 80) + "..." : command}
        </div>
        {output.length > 1500 && (
          <button onClick={() => setCollapsed(!collapsed)} className="font-mono text-[10px] text-[#666] cursor-pointer bg-transparent border-none hover:text-[#AAA]">
            {collapsed ? "expand" : "collapse"}
          </button>
        )}
      </div>
      <pre className={`p-4 font-mono text-[12px] leading-[1.6] overflow-x-auto whitespace-pre-wrap break-words max-h-[350px] overflow-y-auto ${
        error ? "text-[#F87171]" : "text-[#CCC]"
      }`}>{display || "(no output)"}</pre>
      {exitCode !== undefined && exitCode !== 0 && (
        <div className="px-4 py-2 bg-black border-t border-[#333] font-mono text-[11px] text-[#F87171]">
          exit code: {exitCode}
        </div>
      )}
    </div>
  )
}

/* ─── Tool call: search_files result ─── */
function SearchBlock({ pattern, content }: { pattern: string; content: string }) {
  const files = content.split("\n").filter(Boolean)
  return (
    <div>
      <div className="font-mono text-[11px] text-text-muted mb-2">
        Matches for "{pattern}" — {files.length} file{files.length !== 1 ? "s" : ""}
      </div>
      {files.map((f, i) => (
        <div key={i} className="font-mono text-[12px] py-0.5 text-text">{f}</div>
      ))}
    </div>
  )
}

/* ─── Agent message block ─── */
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
    <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-md p-4 font-mono text-xs text-[#DC2626]">
      {content}
    </div>
  )
}

/* ─── Completion block ─── */
function CompletionBlock({ summary, iterations, tokens }: { summary: string; iterations: number; tokens: number }) {
  return (
    <div>
      <div className="text-sm leading-[1.6] text-text whitespace-pre-wrap mb-4">{summary}</div>
      <div className="flex gap-6 pt-4 border-t border-[#F0E8D8] font-mono">
        <div>
          <div className="text-lg font-medium">{iterations}</div>
          <div className="text-[11px] uppercase text-text-muted">Iterations</div>
        </div>
        <div>
          <div className="text-lg font-medium">{tokens.toLocaleString()}</div>
          <div className="text-[11px] uppercase text-text-muted">Tokens</div>
        </div>
      </div>
    </div>
  )
}

/* ─── Render a single event in the stream panel ─── */
function EventRenderer({ event }: { event: AgentEvent }) {
  const d = event.data

  if (event.type === "agent_message") {
    return <MessageBlock content={String(d.content || "")} role={String(d.role || "assistant")} />
  }

  if (event.type === "agent_error") {
    return <ErrorBlock content={String(d.content || "Unknown error")} />
  }

  if (event.type === "tool_call") {
    const tool = String(d.tool || "")
    const args = (d.args || {}) as Record<string, unknown>
    const argStr = Object.entries(args)
      .filter(([, v]) => typeof v === "string" && (v as string).length < 60)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")
    return (
      <div className="flex items-center gap-2 font-mono text-[12px] text-text-muted py-0.5">
        <span className="text-c-orange">▶</span>
        <span className="font-medium text-text">{tool}</span>
        {argStr && <span className="text-[11px]">({argStr})</span>}
      </div>
    )
  }

  if (event.type === "tool_result") {
    const tool = String(d.tool || "")
    const output = String(d.output || "")
    const error = Boolean(d.error)
    const args = (d.args || {}) as Record<string, unknown>

    if (tool === "read_file") {
      return <FileContentBlock path={String(args.path || d.path || "")} content={output} error={error} />
    }
    if (tool === "list_files") {
      return <FileListBlock path={String(args.path || d.path || ".")} content={output} />
    }
    if (tool === "edit_file") {
      return <EditBlock path={String(args.path || d.path || "")} content={output} />
    }
    if (tool === "run_command") {
      return <TerminalBlock command={String(args.command || d.command || "")} output={output} error={error} />
    }
    if (tool === "search_files") {
      return <SearchBlock pattern={String(args.pattern || d.pattern || "")} content={output} />
    }
    // Fallback for unknown tools
    return (
      <pre className="font-mono text-[12px] text-text-muted bg-[#FAF8F5] rounded p-3 whitespace-pre-wrap max-h-[200px] overflow-y-auto">{output}</pre>
    )
  }

  if (event.type === "task_complete") {
    return (
      <CompletionBlock
        summary={String(d.summary || "")}
        iterations={Number(d.iterations || 0)}
        tokens={Number(d.total_tokens || 0)}
      />
    )
  }

  return null
}

/* ─── Sidebar label for an event ─── */
function eventLabel(e: AgentEvent): string {
  if (e.type === "agent_message") {
    const content = String(e.data.content || "")
    return content.length > 40 ? content.slice(0, 40) + "..." : content
  }
  if (e.type === "tool_call") return String(e.data.tool || "tool")
  if (e.type === "tool_result") return `${e.data.tool} result`
  if (e.type === "agent_error") return "Error"
  if (e.type === "task_complete") return "Task Complete"
  if (e.type === "task_init") return "Initialized"
  return e.type
}

/* ════════════════════════════════════════════════
   Main TaskView component
════════════════════════════════════════════════ */
export default function TaskView() {
  const { id } = useParams()
  const [meta, setMeta] = useState<TaskMeta>({ id: id || "", prompt: "", repo: "", branch: "", compute: "" })
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [allDone, setAllDone] = useState(false)
  const [connected, setConnected] = useState(false)
  const [isThinking, setIsThinking] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const eventRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const eventCounter = useRef(0)

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }
  }, [events])

  // SSE connection
  useEffect(() => {
    if (!id) return

    const es = new EventSource(`/api/tasks/${id}/stream`)
    setConnected(true)

    const handleEvent = (type: AgentEvent["type"]) => (e: MessageEvent) => {
      const raw = JSON.parse(e.data)
      const eventId = ++eventCounter.current
      const event: AgentEvent = { id: eventId, type, data: raw }

      if (type === "task_init") {
        setMeta({
          id: raw.id || id,
          prompt: raw.prompt || "",
          repo: raw.repo || "",
          branch: raw.branch || "",
          compute: raw.compute || "",
        })
        return // Don't add to event stream
      }

      if (type === "tool_call") {
        setIsThinking(true)
      }
      if (type === "tool_result" || type === "agent_message") {
        setIsThinking(false)
      }

      if (type === "task_complete") {
        setAllDone(true)
        setIsThinking(false)
        es.close()
        setConnected(false)
      }

      setEvents(prev => [...prev, event])
      setSelectedIdx(eventId)
    }

    es.addEventListener("task_init", handleEvent("task_init"))
    es.addEventListener("tool_call", handleEvent("tool_call"))
    es.addEventListener("tool_result", handleEvent("tool_result"))
    es.addEventListener("agent_message", handleEvent("agent_message"))
    es.addEventListener("agent_error", handleEvent("agent_error"))
    es.addEventListener("task_complete", handleEvent("task_complete"))

    es.onerror = () => { es.close(); setConnected(false) }
    return () => { es.close() }
  }, [id])

  // Scroll to event on sidebar click
  const scrollToEvent = (eventId: number) => {
    setSelectedIdx(eventId)
    const el = eventRefs.current[eventId]
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  // Current phase label for panel header
  const lastToolCall = [...events].reverse().find(e => e.type === "tool_call")
  const phaseLabel = allDone
    ? "COMPLETE"
    : lastToolCall
    ? String(lastToolCall.data.tool || "").toUpperCase()
    : "INITIALIZING"

  // Filter sidebar: show tool_calls, messages, errors, completion — skip tool_results
  const sidebarEvents = events.filter(e =>
    e.type === "tool_call" || e.type === "agent_message" || e.type === "agent_error" || e.type === "task_complete"
  )

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="grid-bg fixed inset-0 z-0" />

      {/* Nav */}
      <nav className="relative z-10 flex justify-between items-center h-12 px-12 max-w-[1344px] mx-auto">
        <Link to="/dashboard" className="font-mono text-sm font-medium text-text no-underline flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
          <div className="w-4 h-4 bg-c-orange grid grid-cols-2 grid-rows-2 gap-px p-px">
            <div className="bg-bg opacity-0" /><div className="bg-bg" /><div className="bg-bg" /><div className="bg-bg" />
          </div>
          Dispatch
        </Link>
        <Link to="/dashboard" className="font-mono text-xs text-text-muted no-underline hover:text-text transition-colors">
          Dashboard
        </Link>
      </nav>

      <div className="max-w-[1344px] mx-auto mt-4 px-12 grid grid-cols-[320px_1fr] gap-8 relative z-10">
        {/* Sidebar — chronological event log */}
        <motion.aside
          className="bg-[#FFFDF8] border border-[#E8D5B5] rounded-lg flex flex-col h-[calc(100vh-80px)]"
          variants={fadeUp} custom={0.1} initial="hidden" animate="visible"
        >
          <div className="px-5 py-5 border-b border-[#F0E8D8]">
            <h2 className="text-xs font-medium uppercase tracking-[0.05em] text-text-muted">Agent Activity</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {sidebarEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => scrollToEvent(event.id)}
                className={`w-full flex gap-3 px-3 py-2.5 rounded-md mb-0.5 text-[12px] leading-relaxed transition-all duration-200 text-left cursor-pointer border-none ${
                  selectedIdx === event.id
                    ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    : "bg-transparent hover:bg-[#FFFBF5]"
                }`}
              >
                {/* Status indicator */}
                {event.type === "tool_call" ? (
                  <div className="mt-[3px] shrink-0"><ToolIcon tool={String(event.data.tool)} /></div>
                ) : event.type === "task_complete" ? (
                  <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#22C55E]" />
                ) : event.type === "agent_error" ? (
                  <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-[#EF4444]" />
                ) : (
                  <div className="w-2 h-2 rounded-full mt-[5px] shrink-0 bg-c-orange" />
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {event.type === "tool_call" ? String(event.data.tool) : eventLabel(event)}
                  </div>
                  {event.type === "tool_call" && (
                    <div className="text-[11px] mt-0.5 text-text-muted truncate">
                      {(() => {
                        const args = (event.data.args || {}) as Record<string, unknown>
                        const first = Object.values(args).find(v => typeof v === "string" && (v as string).length < 50)
                        return first ? String(first) : ""
                      })()}
                    </div>
                  )}
                </div>
              </button>
            ))}
            {/* Show thinking indicator at bottom of sidebar */}
            {isThinking && !allDone && (
              <div className="flex items-center gap-3 px-3 py-2.5 text-[12px] text-text-muted">
                <div className="w-2 h-2 rounded-full bg-c-orange animate-[pulse_1.5s_infinite]" />
                <span>Working...</span>
              </div>
            )}
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
                {meta.repo && <span>Repo: <code className="font-mono">{meta.repo}</code></span>}
                {meta.compute && <span className="font-mono text-[11px] px-1.5 py-px border border-[#F0E8D8] rounded">{meta.compute}</span>}
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
                  Phase // <span className="font-semibold text-text">{phaseLabel}</span>
                </span>
              </div>
              <span className="font-mono text-[11px] text-text-muted">
                {events.filter(e => e.type === "tool_call").length} tool calls
              </span>
            </div>

            {/* Scrollable stream */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
              <AnimatePresence>
                {events.map((event, idx) => {
                  // Group: show phase header before first tool_call and before messages after tool results
                  const prev = idx > 0 ? events[idx - 1] : null
                  const showDivider =
                    (event.type === "tool_call" && (!prev || prev.type !== "tool_call")) ||
                    (event.type === "agent_message" && prev && prev.type === "tool_result") ||
                    event.type === "task_complete" ||
                    event.type === "agent_error"

                  const dividerLabel =
                    event.type === "tool_call" ? String(event.data.tool || "tool")
                    : event.type === "task_complete" ? "Complete"
                    : event.type === "agent_error" ? "Error"
                    : event.type === "agent_message" && String(event.data.role) === "system" ? "System"
                    : "Agent"

                  const dividerStatus: "done" | "active" | "error" =
                    event.type === "task_complete" ? "done"
                    : event.type === "agent_error" ? "error"
                    : "active"

                  return (
                    <motion.div
                      key={event.id}
                      ref={(el) => { eventRefs.current[event.id] = el }}
                      {...streamIn}
                    >
                      {showDivider && <PhaseHeader label={dividerLabel} status={dividerStatus} />}
                      <EventRenderer event={event} />
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {/* Active loader */}
              {isThinking && !allDone && (
                <motion.div {...streamIn} key="loader">
                  <ActiveLoader />
                </motion.div>
              )}

              {/* Completion divider */}
              {allDone && (
                <motion.div {...streamIn} className="pt-4 border-t border-[#F0E8D8]">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[#22C55E]">
                      Task completed
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
