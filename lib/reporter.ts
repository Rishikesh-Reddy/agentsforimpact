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

  // Score: start at 100, deduct for violations
  let score = 100
  score -= criticalCount * 12
  score -= warningCount  * 4
  score = Math.max(0, Math.min(100, score))

  const grade =
    score >= 90 ? 'A' :
    score >= 75 ? 'B' :
    score >= 55 ? 'C' :
    score >= 35 ? 'D' : 'F'

  // Legal risk
  const legalRiskScore = Math.min(100, criticalCount * 15 + warningCount * 5)
  const legalRisk =
    legalRiskScore >= 60 ? 'High' :
    legalRiskScore >= 30 ? 'Medium' : 'Low'

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

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a direct, expert accessibility compliance analyst. Write in a confident, authoritative voice. No fluff. Respond with plain text only. /no_think',
        },
        {
          role: 'user',
          content: `Write a 2-sentence executive summary of this WCAG audit result for ${url}.

Score: ${score}/100 (Grade ${grade})
Critical violations: ${criticalCount}
Warnings: ${warningCount}  
Legal risk: ${legalRisk}

Top issues:
${topViolations}

Be specific — mention the actual violation types found. Start with the most impactful finding.`,
        },
      ],
      max_tokens: 200,
      temperature: 0.2,
    })

    summary = completion.choices[0]?.message?.content
      ?.replace(/<think>[\s\S]*?<\/think>/gi, '')
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
