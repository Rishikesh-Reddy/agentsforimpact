'use client'

import { useState } from 'react'
import type { CriterionGroup as CriterionGroupType } from '@/lib/types'
import { ViolationCard } from './ViolationCard'

interface CriterionGroupProps {
  group: CriterionGroupType
  index: number
}

export function CriterionGroupSection({ group, index }: CriterionGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  const criticalCount = group.violations.filter(v => v.severity === 'critical').length
  const warningCount  = group.violations.filter(v => v.severity === 'warning').length

  const borderColor =
    criticalCount > 0 ? 'border-red-800/40' :
    warningCount  > 0 ? 'border-amber-800/40' :
    'border-green-800/40'

  const dotColor =
    criticalCount > 0 ? 'bg-red-400' :
    warningCount  > 0 ? 'bg-amber-400' :
    'bg-green-400'

  return (
    <div
      className={`rounded-xl border ${borderColor} bg-gray-900/40 overflow-hidden`}
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      {/* Group header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-white/5 transition-colors"
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-blue-400 font-medium">
              WCAG {group.criterionId}
            </span>
            <span className="text-sm font-semibold text-gray-200">{group.criterionName}</span>
          </div>
          {group.description && (
            <p className="text-xs text-gray-600 mt-0.5 truncate">{group.description}</p>
          )}
        </div>

        {/* Counts */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {criticalCount > 0 && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-700/40">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/40">
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs font-mono text-gray-600">
            {group.violations.length} total
          </span>
          <svg
            width="16" height="16" viewBox="0 0 16 16"
            className={`text-gray-600 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </div>
      </button>

      {/* Violations list */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3">
          {group.violations.map((violation, i) => (
            <ViolationCard key={violation.id} violation={violation} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}
