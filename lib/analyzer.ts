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

    const systemPrompt = `You are a senior WCAG 2.1 AA accessibility auditor with 15 years of experience conducting legal compliance audits. You have expert knowledge of all WCAG failure techniques (F1–F107).

Your job is to find REAL violations — including subtle ones that automated tools miss. You understand that:
- An image with alt="bullet" is a VIOLATION (F39: non-null alt on decorative image)
- An image with alt="1234 56789" is a VIOLATION (F30: alt is not a real alternative)  
- An image with 150+ word verbose alt is a VIOLATION (F30: not serving equivalent purpose)
- A link containing only an image with alt="" has NO accessible name (F89: WCAG 2.4.4 failure)
- A CSS background-image with only a title attribute is a VIOLATION (F3: CSS image with info, no text alt)
- Layout tables break reading order for screen readers (F49: WCAG 1.3.2 failure)
- Text styled to look like a heading but not using h1-h6 is a VIOLATION (F2: WCAG 1.3.1)
- Missing lang attribute on <html> is a VIOLATION (WCAG 3.1.1)
- Generic link text "Read more", "Click here", "More" is a VIOLATION (F84: WCAG 2.4.4)

You MUST flag violations in the context field when the crawler has already identified them. If context says "MISSING", "WARNING", "SUSPICIOUS", "NO ACCESSIBLE NAME", or "LIKELY LAYOUT TABLE" — that IS a violation and you MUST include it.

Always respond with valid JSON only — no markdown fences, no explanation outside the JSON. /no_think`

    const userPrompt = `Audit these HTML elements from ${pageUrl} for WCAG 2.1 AA violations. The crawler has pre-annotated suspected issues in the "context" field — treat these as strong signals that require a violation entry.

ELEMENTS TO ANALYZE:
${JSON.stringify(elementsJson, null, 2)}

WCAG CRITERIA TO CHECK:
${WCAG_CRITERIA.map(c => `- ${c.id} ${c.name} (Level ${c.level}): ${c.desc}`).join('\n')}

ADDITIONAL CRITERIA:
- 1.3.2 Meaningful Sequence (A): Reading order must be logical when linearized
- 2.4.1 Bypass Blocks (A): A mechanism must be available to skip repeated navigation
- 2.4.2 Page Titled (A): Web pages have titles that describe topic or purpose
- 3.1.1 Language of Page (A): Default human language of each page can be programmatically determined

VIOLATION DETECTION RULES — apply all of these:
1. img missing alt attribute → CRITICAL (1.1.1)
2. img alt="" when image is the only content of a link → CRITICAL (2.4.4 + 4.1.2)  
3. img with alt="bullet", "image", "photo", "spacer", or any generic word → WARNING (1.1.1 F39)
4. img with alt that is a number or looks like a filename → WARNING (1.1.1 F30)
5. img with alt longer than 100 characters that is not a complex image → WARNING (1.1.1 F30)
6. CSS background-image used for informational image (title attr ≠ proper text alt) → CRITICAL (1.1.1 F3)
7. Link text is "Read more", "Read More...", "Click here", "More", "here" → WARNING (2.4.4 F84)
8. Input/textarea/select with no label, no aria-label, no aria-labelledby → CRITICAL (3.3.2 + 1.3.1)
9. Table with no th, no caption, many cells → likely layout table → WARNING (1.3.1 + 1.3.2 F49)
10. Missing lang attribute on html element → WARNING (3.1.1)
11. No skip navigation link → WARNING (2.4.1)
12. Heading levels skip (e.g. H1 → H4) → WARNING (2.4.6)
13. No heading elements at all → WARNING (1.3.1)
14. Visual headings implemented as <div> or <span> without heading role → CRITICAL (1.3.1 F2)

For every flagged element, produce a violation. Respond ONLY with this JSON (no markdown, no text outside JSON):
{
  "violations": [
    {
      "criterionId": "1.1.1",
      "criterionName": "Non-text Content",
      "severity": "critical",
      "issue": "Specific plain-English description referencing the actual element and what is wrong",
      "currentCode": "The exact bad HTML snippet from the element (max 200 chars)",
      "fixedCode": "The corrected HTML showing exactly what to change (max 200 chars)",
      "explanation": "Why this matters — specifically which users are harmed and how (be concrete)",
      "impact": "e.g. Screen reader users cannot determine the image purpose"
    }
  ]
}

Severity:
- critical = blocks access entirely (missing alt on functional image, unlabeled input, keyboard trap)
- warning = significantly degrades experience (bad alt quality, ambiguous links, layout tables, missing lang)

IMPORTANT: Do NOT return an empty violations array if context fields contain MISSING/WARNING/SUSPICIOUS flags. Those flags mean violations exist and must be reported.`

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

  log.push({
    agent: 'Analyzer',
    step: 'Analysis complete',
    detail: `${allViolations.length} violations found (${allViolations.filter(v => v.severity === 'critical').length} critical)`,
    timestamp: Date.now(),
  })

  return allViolations
}
