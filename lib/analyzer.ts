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

    const systemPrompt = `You are a WCAG 2.1 AA conformance evaluator. Your only job is to determine whether HTML elements FAIL the exact normative WCAG 2.1 success criteria as written at w3.org/WAI/WCAG21/. 

You do NOT apply your own accessibility preferences, best practices, or opinions. You ONLY apply the precise pass/fail conditions from the official spec.

A page can fully pass. Return an empty violations array when nothing fails the spec.
Always respond with valid JSON only — no markdown, no text outside the JSON. /no_think`

    const userPrompt = `Evaluate these HTML elements from ${pageUrl} strictly against the WCAG 2.1 success criteria below.

The crawler has pre-analysed each element. The "context" field tells you what it found:
- Context containing "CRITICAL:" or "WARNING:" or "MISSING" or "NO ACCESSIBLE NAME" or "SUSPICIOUS" → investigate and flag if the spec confirms it
- Context containing "PASS:" or "✓" or "Accessible name found" → the element passes that check. Do NOT flag it.

ELEMENTS:
${JSON.stringify(elementsJson, null, 2)}

━━━ EXACT WCAG 2.1 PASS/FAIL CONDITIONS ━━━
Apply ONLY these rules. Do not add stricter rules of your own.

1.1.1 Non-text Content (Level A)
  FAIL: img element has no alt attribute at all
  FAIL: img used as sole content of a link and alt="" (empty) → link has no accessible name
  FAIL: img alt attribute contains only a filename, number, or the words "image"/"photo"/"spacer"/"bullet"/"graphic"
  PASS: any other non-empty alt text, even if imperfect (e.g. "W3C logo", "company banner", "Clara F.'s website")
  PASS: alt="" when image is decorative and NOT the sole content of a link

2.4.4 Link Purpose — In Context (Level AA)
  FAIL: link whose accessible name (visible text + all img alt text + aria-label + title) is empty or completely non-descriptive (e.g. "click here", "read more", "here", "more", "link")
  PASS: image-only link where the img alt text names the destination or subject (e.g. alt="W3C logo", alt="BBC News", alt="Clara F.'s website") — this IS sufficient under 2.4.4
  PASS: link text that describes a real topic, even if informal (e.g. "the way that air conditioning works", "trombone forgery debacle") — these are descriptive
  DO NOT FLAG: logo image links to the organisation they represent
  DO NOT FLAG: image links where alt clearly identifies the subject or destination

3.3.2 Labels or Instructions (Level A)
  FAIL: input/textarea/select with NO label element (for/id), NO aria-label, NO aria-labelledby, NO title attribute
  PASS: input[type="submit"] or input[type="button"] with a value attribute — the value IS the accessible name
  PASS: any input where context says "Accessible name found"

2.4.6 Headings and Labels (Level AA)
  FAIL: heading text is empty or purely generic (e.g. "heading", "title", "section")
  FAIL: label text is empty or purely generic
  PASS: skipped heading levels (h1→h3) — this is NOT a 2.4.6 failure (it may be a 1.3.1 concern but is not a 2.4.6 violation)
  PASS: any heading with meaningful text, regardless of level order

1.3.1 Info and Relationships (Level A)
  FAIL: content that is visually presented as a list, table, or heading but has NO semantic markup at all
  FAIL: form fields with no programmatic label whatsoever
  PASS: heading level skips — these do not violate 1.3.1 per se

3.1.1 Language of Page (Level A)
  FAIL: html element missing lang attribute entirely
  PASS: html element has any valid lang attribute (e.g. lang="en", lang="fr")
  DO NOT FLAG if context says lang is present

2.4.1 Bypass Blocks (Level A)
  FAIL: page has repeated navigation blocks AND no skip link, no landmark regions (main/nav), and no heading structure to bypass them
  PASS: page has landmark regions (main, nav) OR a skip link — either satisfies 2.4.1
  DO NOT FLAG viewport meta tag — that is not related to 2.4.1

2.4.2 Page Titled (Level A)  
  FAIL: title element is missing or empty
  PASS: title element exists with any text content

━━━ SEVERITY ━━━
CRITICAL: element completely blocks access for AT users (no accessible name, missing title, missing lang)
WARNING: element degrades experience but has a partial workaround

━━━ RESPONSE FORMAT ━━━
Respond ONLY with valid JSON. Empty array is correct when nothing fails:
{
  "violations": [
    {
      "criterionId": "1.1.1",
      "criterionName": "Non-text Content",
      "severity": "critical",
      "issue": "Precise description of what specifically fails the criterion",
      "currentCode": "The exact failing HTML (max 200 chars)",
      "fixedCode": "The minimal corrected HTML (max 200 chars)",
      "explanation": "Which AT users are blocked and exactly how",
      "impact": "e.g. Screen reader announces nothing for this image link"
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
