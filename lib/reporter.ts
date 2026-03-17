import OpenAI from 'openai'
import type { Violation, AnalysisResult, CriterionGroup, AgentLogEntry } from './types'
import { WCAG_CRITERIA } from './analyzer'

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || '',
  baseURL: 'https://integrate.api.nvidia.com/v1',
})

const MODEL = 'nvidia/llama-3.3-nemotron-super-49b-v1'

export async function generateReport(
  url: string,
  violations: Violation[],
  totalElements: number,
  log: AgentLogEntry[]
): Promise<AnalysisResult> {

  log.push({ agent: 'Reporter', step: 'Building report structure', timestamp: Date.now() })

  const criticalCount = violations.filter(v => v.severity === 'critical').length
  const warningCount  = violations.filter(v => v.severity === 'warning').length
  const passCount     = Math.max(0, totalElements - violations.length)

  // Score: ratio-based, not raw-count-based.
  // A compliant site with minor image-link warnings should still score 80+.
  // Formula: start at 100, deduct proportionally to elements analyzed.
  // Critical = 15pts per unique WCAG criterion failed (not per instance)
  // Warning  = 5pts per unique WCAG criterion with warnings
  const uniqueCriticalCriteria = new Set(violations.filter(v => v.severity === 'critical').map(v => v.criterionId)).size
  const uniqueWarningCriteria  = new Set(violations.filter(v => v.severity === 'warning').map(v => v.criterionId)).size

  let score = 100
  score -= uniqueCriticalCriteria * 15
  score -= uniqueWarningCriteria  * 5
  // Extra penalty if criticals are numerous relative to element count
  if (criticalCount > 3) score -= Math.min(15, (criticalCount - 3) * 3)
  score = Math.max(0, Math.min(100, Math.round(score)))

  const grade =
    score >= 90 ? 'A' :
    score >= 75 ? 'B' :
    score >= 55 ? 'C' :
    score >= 35 ? 'D' : 'F'

  // Legal risk based on critical criterion count, not instance count
  const legalRiskScore = Math.min(100, uniqueCriticalCriteria * 20 + uniqueWarningCriteria * 5)
  const legalRisk =
    legalRiskScore >= 60 ? 'High' :
    legalRiskScore >= 25 ? 'Medium' : 'Low'

  // Group by WCAG criterion
  const groupMap = new Map<string, CriterionGroup>()
  for (const criterion of WCAG_CRITERIA) {
    groupMap.set(criterion.id, {
      criterionId: criterion.id,
      criterionName: criterion.name,
      description: criterion.desc,
      violations: [],
      passCount: 0,
    })
  }

  for (const v of violations) {
    const group = groupMap.get(v.criterionId)
    if (group) {
      group.violations.push(v)
    } else {
      // Unknown criterion — create on the fly
      groupMap.set(v.criterionId, {
        criterionId: v.criterionId,
        criterionName: v.criterionName,
        description: '',
        violations: [v],
        passCount: 0,
      })
    }
  }

  // Only include groups that have violations
  const criterionGroups = Array.from(groupMap.values())
    .filter(g => g.violations.length > 0)
    .sort((a, b) => {
      // Sort critical first
      const aHasCritical = a.violations.some(v => v.severity === 'critical') ? 0 : 1
      const bHasCritical = b.violations.some(v => v.severity === 'critical') ? 0 : 1
      return aHasCritical - bHasCritical || b.violations.length - a.violations.length
    })

  // Generate Nemotron narrative summary
  log.push({ agent: 'Reporter', step: 'Generating Nemotron narrative', timestamp: Date.now() })

  let summary = ''
  try {
    const topViolations = violations.slice(0, 6).map(v =>
      `- [${v.severity.toUpperCase()}] ${v.criterionId} ${v.criterionName}: ${v.issue}`
    ).join('\n')

    const passingNote = violations.length === 0
      ? 'No violations were found — the page appears to meet WCAG 2.1 AA standards.'
      : ''

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You write sharp, human accessibility audit summaries — like a senior consultant giving a client a verbal briefing. 
Tone: direct, confident, conversational. No corporate jargon, no bullet points, no bold markdown, no preamble like "Here is a summary".
Just write 2 plain sentences that a non-technical stakeholder would immediately understand.
If the site passes, say so clearly and positively. /no_think`,
        },
        {
          role: 'user',
          content: `Summarize this WCAG 2.1 AA audit in 2 plain sentences. Do not start with "Here is" or repeat the URL.

Site: ${url}
Score: ${score}/100 | Grade: ${grade} | Legal risk: ${legalRisk}
Critical violations: ${criticalCount} | Warnings: ${warningCount}
${passingNote}
${topViolations ? `Key issues:\n${topViolations}` : ''}

First sentence: the headline verdict (what the overall state is and the most important finding).
Second sentence: what that means practically — who is affected or what action is needed.`,
        },
      ],
      max_tokens: 120,
      temperature: 0.3,
    })

    summary = completion.choices[0]?.message?.content
      ?.replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\*\*/g, '')   // strip any stray markdown bold
      .replace(/`/g, '')       // strip backticks
      .trim() ?? ''
  } catch {
    summary = `Found ${criticalCount} critical and ${warningCount} warning violations across ${totalElements} analyzed elements. ${legalRisk === 'High' ? 'This site carries high ADA litigation risk and requires immediate remediation.' : legalRisk === 'Medium' ? 'Moderate accessibility issues detected — remediation recommended.' : 'Minor accessibility improvements identified.'}`
  }

  log.push({
    agent: 'Reporter',
    step: 'Report complete',
    detail: `Score: ${score}/100 | Grade: ${grade} | Risk: ${legalRisk}`,
    timestamp: Date.now(),
  })

  return {
    url,
    scannedAt: new Date().toISOString(),
    overallScore: score,
    grade,
    totalElements,
    criticalCount,
    warningCount,
    passCount,
    legalRisk,
    legalRiskScore,
    summary,
    criterionGroups,
    allViolations: violations,
    agentLog: log,
  }
}
