'use client'

interface AgentLogEntry {
  agent: 'Crawler' | 'Analyzer' | 'Reporter'
  step: string
  detail?: string
  timestamp: number
}

interface AgentLogProps {
  log: AgentLogEntry[]
  isLive?: boolean
}

const agentConfig = {
  Crawler: { color: 'text-blue-400', bg: 'bg-blue-900/40 border-blue-700/40', icon: '⬡' },
  Analyzer: { color: 'text-[#76b900]', bg: 'bg-[#76b900]/10 border-[#76b900]/30', icon: '◎' },
  Reporter: { color: 'text-purple-400', bg: 'bg-purple-900/40 border-purple-700/40', icon: '◈' },
}

export function AgentLog({ log, isLive = false }: AgentLogProps) {
  if (log.length === 0) return null

  return (
    <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-[#76b900] animate-pulse" />
        <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">
          Agent Pipeline Log
        </span>
        {isLive && (
          <span className="text-xs font-mono text-[#76b900] ml-auto">● Live</span>
        )}
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {log.map((entry, i) => {
          const cfg = agentConfig[entry.agent]
          return (
            <div key={i} className="flex items-start gap-2 text-xs font-mono">
              <span className={`px-1.5 py-0.5 rounded border text-xs flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                {cfg.icon} {entry.agent}
              </span>
              <span className="text-gray-400">{entry.step}</span>
              {entry.detail && (
                <span className="text-gray-600 truncate">{entry.detail}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
