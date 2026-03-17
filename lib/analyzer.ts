import OpenAI from 'openai'
import type { ExtractedElement, Violation, AgentLogEntry } from './types'

// WCAG 2.1 AA criteria we check
export const WCAG_CRITERIA = [
  { id: '1.1.1', name: 'Non-text Content',        level: 'A',  desc: 'All non-text content has a text alternative' },
  { id: '1.3.1', name: 'Info and Relationships',  level: 'A',  desc: 'Information conveyed through presentation can be programmatically determined' },
  { id: '1.4.1', name: 'Use of Color',            level: 'A',  desc: 'Color is not the only visual means of conveying information' },
  { id: '1.4.3', name: 'Contrast (Minimum)',      level: 'AA', desc: 'Text has a contrast ratio of at least 4.5:1' },
  { id: '1.4.4', name: 'Resize Text',             level: 'AA', desc: 'Text can be resized up to 200% without loss of content' },
  { id: '2.1.1', name: 'Keyboard',                level: 'A',  desc: 'All functionality is operable via keyboard' },
  { id: '2.4.4', name: 'Link Purpose (In Context)',level:'AA', desc: 'Purpose of each link can be determined from link text or context' },
  { id: '2.4.6', name: 'Headings and Labels',     level: 'AA', desc: 'Headings and labels describe topic or purpose' },
  { id: '3.3.1', name: 'Error Identification',    level: 'A',  desc: 'Input errors are identified and described to the user' },
  { id: '3.3.2', name: 'Labels or Instructions',  level: 'A',  desc: 'Labels or instructions are provided for user input' },
  { id: '4.1.2', name: 'Name, Role, Value',       level: 'A',  desc: 'For all UI components, name and role can be programmatically determined' },
  { id: '1.2.2', name: 'Captions (Prerecorded)',  level: 'A',  desc: 'Captions are provided for prerecorded audio content in video' },
]

const client = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || '',
  baseURL: 'https://integrate.api.nvidia.com/v1',
})

// Current Nemotron model — Super 49B is the best balance of speed + reasoning for agentic tasks
// Ultra 253B also works but is slower: 'nvidia/llama-3.1-nemotron-ultra-253b-v1'
const MODEL = 'nvidia/llama-3.3-nemotron-super-49b-v1'

interface RawViolation {
  criterionId: string
  criterionName: string
  severity: 'critical' | 'warning' | 'pass'
  issue: string
  currentCode: string
  fixedCode: string
  explanation: string
  impact: string
}

export async function analyzeElements(
  elements: ExtractedElement[],
  pageUrl: string,
  log: AgentLogEntry[]
): Promise<Violation[]> {

  log.push({ agent: 'Analyzer', step: 'Starting Nemotron analysis', detail: `${elements.length} elements`, timestamp: Date.now() })

  // Batch elements into groups of ~8 to avoid token limits per call
  const BATCH_SIZE = 8
  const batches: ExtractedElement[][] = []
  for (let i = 0; i < elements.length; i += BATCH_SIZE) {
    batches.push(elements.slice(i, i + BATCH_SIZE))
  }

  const allViolations: Violation[] = []
  let violationCounter = 0

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    log.push({
      agent: 'Analyzer',
      step: `Batch ${batchIdx + 1}/${batches.length}`,
      detail: `Analyzing ${batch.length} elements with Nemotron`,
      timestamp: Date.now(),
    })

    const elementsJson = batch.map((el, i) => ({
      index: i,
      type: el.type,
      html: el.html,
      attributes: el.attributes,
      textContent: el.textContent,
      context: el.context,
    }))

    const systemPrompt = `You are a senior WCAG 2.1 AA accessibility auditor with 15 years of legal compliance experience. Your audits must be accurate — both false negatives (missing real issues) and false positives (inventing issues) harm your clients.

CORE RULES:
- Only flag violations you can directly observe in the provided HTML and context
- If the context field says a value is PRESENT (e.g. "lang attribute: en ✓"), do NOT flag it as missing
- If context says "Accessible name found", do NOT flag that element as unlabeled
- A descriptive alt text on an image-only link (e.g. alt="W3C logo") is a WARNING, not a CRITICAL — the link has an accessible name, it's just potentially non-descriptive enough
- Image-only link is CRITICAL only when alt="" (completely empty, no accessible name at all)
- Do NOT flag the same element twice for the same criterion
- Do NOT speculate about issues not visible in the HTML (e.g. "page title may not describe content" without seeing a bad title)
- A page can genuinely pass — returning zero violations is correct and acceptable when the HTML is clean

Always respond with valid JSON only — no markdown fences, no explanation outside the JSON. /no_think`

    const userPrompt = `Audit these HTML elements from ${pageUrl} for WCAG 2.1 AA violations.

The crawler has pre-annotated findings in the "context" field. Trust the context:
- Context saying "MISSING", "NO ACCESSIBLE NAME", "LIKELY LAYOUT TABLE", or "SUSPICIOUS" → real violation, flag it
- Context saying "✓", "Accessible name found", "present" → element passes that check, do NOT flag it
- Context saying "WARNING: non-descriptive link text" → flag as WARNING only (not CRITICAL)

ELEMENTS TO ANALYZE:
${JSON.stringify(elementsJson, null, 2)}

WCAG CRITERIA TO CHECK:
${WCAG_CRITERIA.map(c => `- ${c.id} ${c.name} (Level ${c.level}): ${c.desc}`).join('\n')}

ADDITIONAL CRITERIA:
- 1.3.2 Meaningful Sequence (A): Reading order must be logical when linearized
- 2.4.1 Bypass Blocks (A): Skip navigation link required
- 2.4.2 Page Titled (A): Page title must describe content
- 3.1.1 Language of Page (A): html lang attribute required

SEVERITY GUIDE:
- CRITICAL: completely blocks access (img missing alt entirely, input with zero accessible name, keyboard trap)
- WARNING: degrades experience but workaround exists (bad alt quality, non-descriptive link text, layout table, skipped heading levels)
- Do NOT invent a third severity — only critical or warning

DEDUPLICATION: If you see the same element appear in multiple batches, report it only once.

Respond ONLY with this JSON (no markdown, no text outside JSON):
{
  "violations": [
    {
      "criterionId": "1.1.1",
      "criterionName": "Non-text Content",
      "severity": "critical",
      "issue": "Specific description referencing the actual element",
      "currentCode": "The exact bad HTML snippet (max 200 chars)",
      "fixedCode": "The corrected HTML (max 200 chars)",
      "explanation": "Why this matters for users with disabilities",
      "impact": "Which users are affected and how"
    }
  ]
}`

    try {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      })

      const raw = completion.choices[0]?.message?.content ?? ''
      // Strip reasoning blocks (Nemotron Super reasoning mode produces <think>...</think>)
      const clean = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json|```/g, '')
        .trim()

      let parsed: { violations: RawViolation[] }
      try {
        parsed = JSON.parse(clean)
      } catch {
        // Try to extract JSON from response
        const match = clean.match(/\{[\s\S]*\}/)
        if (match) {
          parsed = JSON.parse(match[0])
        } else {
          log.push({ agent: 'Analyzer', step: 'Parse warning', detail: 'Could not parse batch response, skipping', timestamp: Date.now() })
          continue
        }
      }

      for (const v of (parsed.violations || [])) {
        // Deduplicate: skip if same criterion + same current code already recorded
        const isDupe = allViolations.some(existing =>
          existing.criterionId === v.criterionId &&
          existing.currentCode?.trim().slice(0, 60) === v.currentCode?.trim().slice(0, 60)
        )
        if (isDupe) continue

        violationCounter++
        allViolations.push({
          id: `v${violationCounter}`,
          severity: v.severity,
          criterionId: v.criterionId,
          criterionName: v.criterionName,
          element: batch[0]?.type ?? 'unknown',
          selector: batch[0]?.selector ?? '',
          issue: v.issue,
          currentCode: v.currentCode,
          fixedCode: v.fixedCode,
          explanation: v.explanation,
          impact: v.impact,
          wcagLevel: WCAG_CRITERIA.find(c => c.id === v.criterionId)?.level === 'AA' ? 'AA' : 'A',
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log.push({ agent: 'Analyzer', step: 'Batch error', detail: msg, timestamp: Date.now() })
      // Continue with other batches
    }
  }

  // ── Post-processing: strip known hallucination patterns ─────────────────
  // These are violations the model commonly invents when it lacks sufficient evidence.
  const filtered = allViolations.filter(v => {
    const issue = (v.issue ?? '').toLowerCase()
    const fix   = (v.fixedCode ?? '').toLowerCase()
    const current = (v.currentCode ?? '').toLowerCase()

    // RULE 1: Don't flag lang/title/skip-nav as CRITICAL if the fix code
    // just adds something generic — means the model assumed they were missing
    // without seeing evidence. These should only appear if the crawler flagged them
    // explicitly in the page-level element's context.
    if (v.criterionId === '3.1.1' && !current.includes('lang') && !issue.includes('missing')) return false
    if (v.criterionId === '2.4.2' && !current.includes('title') && !issue.includes('missing')) return false

    // RULE 2: meta viewport is NOT a WCAG 2.4.1 criterion — pure hallucination
    if (v.criterionId === '2.4.1' && (issue.includes('viewport') || fix.includes('viewport'))) return false

    // RULE 3: missing <main>/<nav> landmarks alone ≠ a 3.1.1 lang violation
    if (v.criterionId === '3.1.1' && (issue.includes('<main>') || issue.includes('<nav>'))) return false

    // RULE 4: Image-only link with descriptive alt (>= 4 chars, not generic) is not a violation
    // The crawler already marked these as PASS in the context field
    if (v.criterionId === '2.4.4') {
      // If the "current code" shows an img with a real alt text (not empty), downgrade to at most WARNING
      const altMatch = current.match(/alt="([^"]+)"/)
      if (altMatch && altMatch[1].length >= 4 && v.severity === 'critical') {
        v.severity = 'warning'
      }
    }

    return true
  })

  log.push({
    agent: 'Analyzer',
    step: 'Analysis complete',
    detail: `${filtered.length} violations (${filtered.filter(v => v.severity === 'critical').length} critical) after filtering ${allViolations.length - filtered.length} false positives`,
    timestamp: Date.now(),
  })

  return filtered
}
