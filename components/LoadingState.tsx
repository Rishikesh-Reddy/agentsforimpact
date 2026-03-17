'use client'

import { useEffect, useState } from 'react'

interface LoadingStateProps {
  url: string
}

const STEPS = [
  { agent: 'Crawler',  label: 'Fetching HTML & extracting elements',       color: 'text-blue-400',        dot: 'bg-blue-400' },
  { agent: 'Crawler',  label: 'Parsing images, links, inputs, headings',    color: 'text-blue-400',        dot: 'bg-blue-400' },
  { agent: 'Analyzer', label: 'Running WCAG 2.1 AA criteria checks',        color: 'text-[#76b900]',       dot: 'bg-[#76b900]' },
  { agent: 'Analyzer', label: 'Calling Nemotron on element batches',         color: 'text-[#76b900]',       dot: 'bg-[#76b900]' },
  { agent: 'Analyzer', label: 'Detecting contrast, ARIA, keyboard issues',  color: 'text-[#76b900]',       dot: 'bg-[#76b900]' },
  { agent: 'Reporter', label: 'Scoring & grouping violations by criterion',  color: 'text-purple-400',      dot: 'bg-purple-400' },
  { agent: 'Reporter', label: 'Generating Nemotron executive summary',       color: 'text-purple-400',      dot: 'bg-purple-400' },
]

export function LoadingState({ url }: LoadingStateProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [progress, setProgress]     = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(s => {
        const next = s < STEPS.length - 1 ? s + 1 : s
        setProgress(Math.round(((next + 1) / STEPS.length) * 90))
        return next
      })
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  const agentBadge = (agent: string) => {
    const map: Record<string, string> = {
      Crawler:  'bg-blue-900/50 text-blue-300 border-blue-700/50',
      Analyzer: 'bg-[#76b900]/10 text-[#76b900] border-[#76b900]/30',
      Reporter: 'bg-purple-900/50 text-purple-300 border-purple-700/50',
    }
    return map[agent] ?? ''
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 animate-fade-up">

      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-[#76b900] animate-pulse" />
          <span className="text-sm font-mono text-[#76b900] tracking-wider uppercase">
            3-Agent Pipeline Running
          </span>
        </div>
        <h2 className="text-xl font-semibold text-gray-200 mb-2">Analyzing accessibility</h2>
        <p className="text-sm text-gray-500 font-mono truncate max-w-sm mx-auto">{url}</p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs font-mono text-gray-600 mb-1.5">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #76b900, #a3e635)',
            }}
          />
        </div>
      </div>

      {/* Agent pipeline diagram */}
      <div className="flex items-center justify-center gap-3 mb-8">
        {['Crawler', 'Analyzer', 'Reporter'].map((agent, i) => {
          const isActive = STEPS[activeStep]?.agent === agent
          const isDone   = (
            (agent === 'Crawler'  && activeStep >= 2) ||
            (agent === 'Analyzer' && activeStep >= 5) ||
            (agent === 'Reporter' && activeStep >= 7)
          )
          return (
            <div key={agent} className="flex items-center gap-3">
              <div
                className={`
                  px-3 py-2 rounded-lg border text-xs font-mono font-medium transition-all duration-300
                  ${isActive
                    ? agent === 'Crawler'  ? 'bg-blue-900/60 border-blue-500/60 text-blue-300 shadow-lg shadow-blue-900/30'
                    : agent === 'Analyzer' ? 'bg-[#76b900]/15 border-[#76b900]/50 text-[#76b900] shadow-lg shadow-[#76b900]/10'
                    :                        'bg-purple-900/60 border-purple-500/60 text-purple-300 shadow-lg shadow-purple-900/30'
                    : isDone
                      ? 'bg-gray-800/60 border-gray-600/40 text-gray-400'
                      : 'bg-gray-900/40 border-gray-700/40 text-gray-600'
                  }
                `}
              >
                {isDone ? '✓ ' : isActive ? '● ' : '○ '}
                {agent}
              </div>
              {i < 2 && (
                <div className={`text-gray-700 text-lg transition-colors duration-300 ${isDone ? 'text-gray-500' : ''}`}>
                  →
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Steps log */}
      <div className="space-y-2">
        {STEPS.map((step, i) => {
          const state = i < activeStep ? 'done' : i === activeStep ? 'active' : 'pending'
          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-300 ${
                state === 'active'
                  ? 'bg-gray-800/60 border-gray-600/40'
                  : state === 'done'
                    ? 'bg-transparent border-transparent opacity-50'
                    : 'bg-transparent border-transparent opacity-30'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-300 ${
                state === 'done'   ? 'bg-gray-600' :
                state === 'active' ? `${step.dot} animate-pulse` :
                'bg-gray-700'
              }`} />
              <span className={`text-xs border px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${agentBadge(step.agent)}`}>
                {step.agent}
              </span>
              <span className={`text-xs font-mono ${
                state === 'active' ? 'text-gray-300' :
                state === 'done'   ? 'text-gray-600' :
                'text-gray-700'
              }`}>
                {step.label}
                {state === 'active' && <span className="animate-pulse ml-1">…</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
