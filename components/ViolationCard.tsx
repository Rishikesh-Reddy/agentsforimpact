'use client'

import { useState } from 'react'
import type { Violation } from '@/lib/types'

interface ViolationCardProps {
  violation: Violation
  index: number
}

export function ViolationCard({ violation, index }: ViolationCardProps) {
  const [expanded, setExpanded] = useState(false)

  const sevConfig = {
    critical: {
      label: 'Critical',
      bg: 'bg-red-950/60',
      border: 'border-red-800/50',
      badge: 'bg-red-900/80 text-red-300 border border-red-700/50',
      dot: 'bg-red-400',
      icon: '✕',
    },
    warning: {
      label: 'Warning',
      bg: 'bg-amber-950/40',
      border: 'border-amber-800/40',
      badge: 'bg-amber-900/80 text-amber-300 border border-amber-700/50',
      dot: 'bg-amber-400',
      icon: '△',
    },
    pass: {
      label: 'Pass',
      bg: 'bg-green-950/30',
      border: 'border-green-800/40',
      badge: 'bg-green-900/80 text-green-300 border border-green-700/50',
      dot: 'bg-green-400',
      icon: '✓',
    },
  }

  const cfg = sevConfig[violation.severity]

  return (
    <div
      className={`rounded-lg border ${cfg.bg} ${cfg.border} overflow-hidden transition-all duration-200`}
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors"
      >
        {/* Dot */}
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${cfg.dot}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${cfg.badge}`}>
              {cfg.icon} {cfg.label}
            </span>
            <span className="text-xs font-mono text-blue-400 bg-blue-900/40 border border-blue-700/40 px-2 py-0.5 rounded">
              WCAG {violation.criterionId}
            </span>
            <span className="text-xs text-gray-500 font-mono">{violation.criterionName}</span>
          </div>
          <p className="text-sm text-gray-300 mt-1.5 leading-relaxed">{violation.issue}</p>
        </div>

        {/* Expand icon */}
        <div className={`text-gray-500 flex-shrink-0 transition-transform duration-200 mt-0.5 ${expanded ? 'rotate-180' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-4 space-y-4">
          {/* Code diff */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-xs font-mono text-red-400 uppercase tracking-wider">Current Code</span>
              </div>
              <pre className="code-block bg-red-950/40 border border-red-800/30 rounded-lg p-3 text-red-300 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                <code>{violation.currentCode}</code>
              </pre>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-xs font-mono text-green-400 uppercase tracking-wider">Fixed Code</span>
              </div>
              <pre className="code-block bg-green-950/40 border border-green-800/30 rounded-lg p-3 text-green-300 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                <code>{violation.fixedCode}</code>
              </pre>
            </div>
          </div>

          {/* Explanation + Impact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-3">
              <p className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1.5">Why It Matters</p>
              <p className="text-sm text-gray-400 leading-relaxed">{violation.explanation}</p>
            </div>
            <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg p-3">
              <p className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1.5">Who Is Affected</p>
              <p className="text-sm text-gray-400 leading-relaxed">{violation.impact}</p>
            </div>
          </div>

          {/* WCAG level badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-mono">Conformance level:</span>
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
              WCAG 2.1 Level {violation.wcagLevel}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
