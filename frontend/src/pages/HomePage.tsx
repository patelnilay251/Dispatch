import { useState } from "react"
import { useNavigate, Link } from "react-router"
import { motion } from "framer-motion"
import { useAuth } from "../lib/auth"
import { apiFetch } from "../lib/api"

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] },
  }),
}

const blockEntrance = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: (delay: number) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] },
  }),
}

type BlockProps = { color: string; col: number; row: number; delay: number }

function Block({ color, col, row, delay }: BlockProps) {
  return (
    <motion.div
      className={`w-full h-full ${color}`}
      style={{ gridColumn: col, gridRow: row }}
      variants={blockEntrance}
      custom={delay}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -6, scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    />
  )
}

function GitHubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export default function HomePage() {
  const [prompt, setPrompt] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const { user, loading, signIn, signOut } = useAuth()

  const handleSubmit = async () => {
    if (!prompt.trim() || submitting) return

    if (!user) {
      signIn()
      return
    }

    setSubmitting(true)
    try {
      const res = await apiFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({ prompt: prompt.trim(), repo: "dispatch/core-agent" }),
      })
      const data = await res.json()
      if (data.id) {
        navigate(`/task/${data.id}`)
      }
    } catch {
      // TODO: show error toast
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      <div className="grid-bg z-0" />

      {/* Nav */}
      <nav className="relative z-10 flex justify-between items-center h-16 px-12 max-w-[1400px] mx-auto w-full">
        <Link to="/dashboard" className="font-mono text-sm font-medium text-text no-underline flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
          <div className="w-4 h-4 bg-c-orange grid grid-cols-2 grid-rows-2 gap-px p-px">
            <div className="bg-bg opacity-0" /><div className="bg-bg" /><div className="bg-bg" /><div className="bg-bg" />
          </div>
          Dispatch
        </Link>

        <div className="flex items-center gap-5">
          <Link to="/dashboard" className="font-mono text-xs text-text-muted no-underline hover:text-text transition-colors">
            Dashboard
          </Link>

          {!loading && (
            user ? (
              <button
                onClick={signOut}
                className="flex items-center gap-2 bg-transparent border-none cursor-pointer group"
              >
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt=""
                    className="w-6 h-6 rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#E8D5B5] opacity-70 group-hover:opacity-100 transition-opacity" />
                )}
                <span className="font-mono text-xs text-text-muted group-hover:text-text transition-colors">
                  {user.user_metadata?.user_name || "Sign out"}
                </span>
              </button>
            ) : (
              <button
                onClick={signIn}
                className="flex items-center gap-2 bg-transparent border-none cursor-pointer font-mono text-xs text-text-muted hover:text-text transition-colors"
              >
                <GitHubIcon size={14} />
                Sign in
              </button>
            )
          )}
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center pt-[8vh] relative z-10">
        <motion.div className="text-center mb-16 max-w-[800px] px-6" initial="hidden" animate="visible">
          <motion.h1 className="text-[56px] font-medium tracking-[-0.04em] leading-[1.1] mb-5 text-text" variants={fadeUp} custom={0.05}>
            The async cloud coding agent.
          </motion.h1>
          <motion.p className="text-lg font-normal text-text-muted tracking-[-0.01em]" variants={fadeUp} custom={0.15}>
            Describe your architecture. Dispatch handles the implementation, testing, and PR.
          </motion.p>
        </motion.div>

        <div className="composition relative mb-[12vh]">
          <Block color="bg-c-orange" col={3} row={1} delay={0.4} />
          <Block color="bg-c-yellow" col={4} row={1} delay={0.4} />
          <Block color="bg-c-red" col={2} row={2} delay={0.5} />
          <Block color="bg-c-light" col={2} row={3} delay={0.6} />
          <Block color="bg-c-light" col={11} row={1} delay={0.45} />
          <Block color="bg-c-red" col={12} row={1} delay={0.45} />
          <Block color="bg-c-orange" col={13} row={2} delay={0.6} />
          <Block color="bg-c-yellow" col={13} row={3} delay={0.6} />
          <Block color="bg-c-orange" col={2} row={4} delay={0.5} />
          <Block color="bg-c-yellow" col={2} row={5} delay={0.5} />
          <Block color="bg-c-light" col={3} row={5} delay={0.5} />
          <Block color="bg-c-red" col={4} row={5} delay={0.6} />
          <Block color="bg-c-red" col={13} row={4} delay={0.55} />
          <Block color="bg-c-orange" col={11} row={5} delay={0.55} />
          <Block color="bg-c-yellow" col={12} row={5} delay={0.6} />
          <Block color="bg-c-light" col={13} row={5} delay={0.6} />

          <motion.div
            className="card bg-white rounded-lg shadow-[0_24px_48px_rgba(0,0,0,0.04),0_8px_16px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.02)] p-6 flex flex-col justify-between relative z-10 overflow-hidden"
            style={{ gridColumn: "3 / 13", gridRow: "2 / 5" }}
            variants={fadeUp}
            custom={0.25}
            initial="hidden"
            animate="visible"
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-c-red via-c-orange to-c-yellow scale-x-0 origin-left transition-transform duration-400" />
            <textarea
              className="input-field w-full border-none bg-transparent font-[inherit] text-xl font-normal leading-[1.4] tracking-[-0.01em] text-text resize-none outline-none h-full"
              placeholder={user ? "What should we build today?" : "Sign in with GitHub to get started..."}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!user && !loading}
            />
            <div className="flex justify-between items-end mt-4">
              <button className="inline-flex items-center gap-2 py-1.5 px-3 rounded-md text-sm font-medium text-[#444] bg-transparent border border-transparent cursor-pointer -ml-3 transition-all duration-200 hover:bg-[#F5F5F5] hover:text-text hover:-translate-y-px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="6" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" />
                  <path d="M6 9v6" /><path d="M18 9v2a2 2 0 0 1-2 2h-4a2 2 0 0 0-2 2v2" />
                </svg>
                dispatch/core-agent
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-0.5 text-[#888]">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {user ? (
                <button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || submitting}
                  className="w-10 h-10 bg-text border-none rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-[1.12] hover:shadow-[0_6px_20px_rgba(0,0,0,0.18)] active:scale-[0.96] disabled:opacity-30 disabled:cursor-default disabled:hover:scale-100 disabled:hover:shadow-none"
                  aria-label="Submit task"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                    </svg>
                  )}
                </button>
              ) : (
                <button
                  onClick={signIn}
                  className="h-10 px-4 bg-text text-bg border-none rounded-lg flex items-center gap-2.5 cursor-pointer font-mono text-xs font-medium transition-all duration-200 hover:scale-[1.04] hover:shadow-[0_6px_20px_rgba(0,0,0,0.18)] active:scale-[0.97]"
                >
                  <GitHubIcon size={14} />
                  Continue with GitHub
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
