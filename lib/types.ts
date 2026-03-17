export type Severity = 'critical' | 'warning' | 'pass'

export interface WcagCriterion {
  id: string        // e.g. "1.1.1"
  name: string      // e.g. "Non-text Content"
  level: 'A' | 'AA' | 'AAA'
  description: string
}

export interface ExtractedElement {
  type: 'image' | 'button' | 'link' | 'input' | 'heading' | 'form' | 'video' | 'iframe' | 'table' | 'custom'
  html: string       // raw outer HTML snippet (max 300 chars)
  selector: string   // CSS selector hint
  attributes: Record<string, string>
  textContent?: string
  context?: string   // surrounding HTML for context
}

export interface Violation {
  id: string
  severity: Severity
  criterionId: string
  criterionName: string
  element: string          // element type
  selector: string
  issue: string            // plain-English problem description
  currentCode: string      // the bad HTML
  fixedCode: string        // the corrected HTML
  explanation: string      // why this matters for users with disabilities
  impact: string           // which disability groups are affected
  wcagLevel: 'A' | 'AA'
}

export interface CriterionGroup {
  criterionId: string
  criterionName: string
  description: string
  violations: Violation[]
  passCount: number
}

export interface AnalysisResult {
  url: string
  scannedAt: string
  overallScore: number     // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  totalElements: number
  criticalCount: number
  warningCount: number
  passCount: number
  legalRisk: 'High' | 'Medium' | 'Low'
  legalRiskScore: number   // 0-100
  summary: string          // Nemotron narrative
  criterionGroups: CriterionGroup[]
  allViolations: Violation[]
  agentLog: AgentLogEntry[]
}

export interface AgentLogEntry {
  agent: 'Crawler' | 'Analyzer' | 'Reporter'
  step: string
  detail?: string
  timestamp: number
}
