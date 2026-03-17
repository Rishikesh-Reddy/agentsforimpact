import { NextRequest, NextResponse } from 'next/server'
import { crawlUrl } from '@/lib/crawler'
import { analyzeElements } from '@/lib/analyzer'
import { generateReport } from '@/lib/reporter'
import type { AgentLogEntry } from '@/lib/types'

export const maxDuration = 60  // allow up to 60s for full analysis

export async function POST(req: NextRequest) {
  const log: AgentLogEntry[] = []

  try {
    const body = await req.json()
    const { url } = body as { url: string }

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Normalize URL
    let normalizedUrl = url.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl
    }

    try {
      new URL(normalizedUrl)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    if (!process.env.NVIDIA_API_KEY) {
      return NextResponse.json(
        { error: 'NVIDIA_API_KEY environment variable is not set. Add it to .env.local' },
        { status: 500 }
      )
    }

    // ── AGENT 1: CRAWLER ─────────────────────────────────────────
    const { elements, pageTitle } = await crawlUrl(normalizedUrl, log)

    if (elements.length === 0) {
      return NextResponse.json(
        { error: 'No analyzable elements found. The site may be JavaScript-rendered or behind authentication.' },
        { status: 422 }
      )
    }

    // ── AGENT 2: ANALYZER ────────────────────────────────────────
    const violations = await analyzeElements(elements, normalizedUrl, log)

    // ── AGENT 3: REPORTER ────────────────────────────────────────
    const report = await generateReport(normalizedUrl, violations, elements.length, log)

    return NextResponse.json({
      ...report,
      pageTitle,
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    console.error('[WCAG Analyzer Error]', err)
    return NextResponse.json({ error: message, agentLog: log }, { status: 500 })
  }
}
