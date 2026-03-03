import { useState } from "react"
import { useNavigate } from "react-router"
import { motion } from "framer-motion"

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
export default function HomePage() {
  const [prompt, setPrompt] = useState("")
  const navigate = useNavigate()

  const handleSubmit = async () => {
    if (!prompt.trim()) return
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), repo: "dispatch/core-agent" }),
      })
      const data = await res.json()
      navigate(`/task/${data.id}`)
    } catch {
      // Fallback for when backend is down
      const id = `DSP-${Math.floor(1000 + Math.random() * 9000)}`
      navigate(`/task/${id}`, { state: { prompt: prompt.trim(), repo: "dispatch/core-agent", offline: true } })
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
      <main className="flex-1 flex flex-col items-center pt-[12vh] relative z-10">
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
              placeholder="What should we build today?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
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
              <button
                onClick={handleSubmit}
                className="w-10 h-10 bg-text border-none rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-[1.12] hover:shadow-[0_6px_20px_rgba(0,0,0,0.18)] active:scale-[0.96]"
                aria-label="Submit task"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}