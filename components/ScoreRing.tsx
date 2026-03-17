'use client'

interface ScoreRingProps {
  score: number
  grade: string
  size?: number
}

export function ScoreRing({ score, grade, size = 160 }: ScoreRingProps) {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const scoreColor =
    score >= 80 ? '#76b900' :
    score >= 50 ? '#f59e0b' : '#ef4444'

  const gradeColor =
    grade === 'A' ? '#76b900' :
    grade === 'B' ? '#84cc16' :
    grade === 'C' ? '#f59e0b' :
    grade === 'D' ? '#f97316' : '#ef4444'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1f2937"
          strokeWidth="8"
        />
        {/* Score ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={scoreColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1s ease, stroke 0.3s ease',
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-4xl font-bold leading-none" style={{ color: scoreColor }}>
          {score}
        </span>
        <span className="text-xs text-gray-500 mt-0.5 font-mono uppercase tracking-widest">score</span>
        <div
          className="mt-1.5 text-sm font-bold px-2 py-0.5 rounded"
          style={{ color: gradeColor, background: `${gradeColor}18` }}
        >
          Grade {grade}
        </div>
      </div>
    </div>
  )
}
