'use client'

import { useState, useRef } from 'react'
import type { AnalysisResult } from '@/lib/types'
import { LoadingState } from '@/components/LoadingState'
import { ResultsView } from '@/components/ResultsView'

type AppState = 'idle' | 'loading' | 'results' | 'error'

const DEMO_URLS = [
  'https://example.com',
  'https://wikipedia.org',
  'https://bbc.com',
]

export default function Home() {
  const [url, setUrl]         = useState('')
  const [state, setState]     = useState<AppState>('idle')
  const [result, setResult]   = useState<(AnalysisResult & { pageTitle?: string }) | null>(null)
  const [error, setError]     = useState('')
  const [scanning, setScanning] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleAnalyze(targetUrl?: string) {
    const urlToScan = (targetUrl ?? url).trim()
    if (!urlToScan) {
      inputRef.current?.focus()
      return
    }

    setError('')
    setScanning(urlToScan)
    setState('loading')

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToScan }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed')
      }

      setResult(data)
      setState('results')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
      setState('error')
    }
  }

  function handleReset() {
    setState('idle')
    setResult(null)
    setError('')
    setUrl('')
    setScanning('')
  }

  // ── LOADING ────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Header />
        <LoadingState url={scanning} />
        <Footer />
      </div>
    )
  }

  // ── RESULTS ───────────────────────────────────────────────────
  if (state === 'results' && result) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <Header />
        <main className="pt-8">
          <ResultsView result={result} onReset={handleReset} />
        </main>
        <Footer />
      </div>
    )
  }

  // ── IDLE / ERROR ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">

        {/* Hero */}
        <div className="text-center max-w-2xl mb-12 animate-fade-up">
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full border border-[#76b900]/30 bg-[#76b900]/8">
            <div className="w-1.5 h-1.5 rounded-full bg-[#76b900] animate-pulse" />
            <span className="text-xs font-mono text-[#76b900] tracking-wider uppercase">
              3-Agent AI Pipeline · WCAG 2.1 AA
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-5 leading-tight tracking-tight">
            Is your website<br />
            <span style={{ color: '#76b900' }}>accessible?</span>
          </h1>

          <p className="text-lg text-gray-400 leading-relaxed font-light max-w-lg mx-auto">
            Paste any URL. Our AI agent crawls it, runs WCAG 2.1 AA checks with{' '}
            <span className="text-[#76b900] font-medium">NVIDIA Nemotron</span>, and delivers
            a full compliance report with exact code fixes.
          </p>
        </div>

        {/* URL Input card */}
        <div
          className="w-full max-w-xl bg-gray-900/60 border border-gray-700/50 rounded-2xl p-6 shadow-2xl animate-fade-up"
          style={{ animationDelay: '0.1s' }}
        >
          <div className="flex gap-3 mb-4">
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              placeholder="https://yourwebsite.com"
              className="flex-1 bg-gray-800/60 border border-gray-700/60 rounded-xl px-4 py-3 text-gray-200 font-mono text-sm placeholder-gray-600 outline-none focus:border-[#76b900]/50 focus:ring-1 focus:ring-[#76b900]/20 transition-all"
              autoFocus
            />
            <button
              onClick={() => handleAnalyze()}
              disabled={!url.trim()}
              className="px-6 py-3 rounded-xl font-semibold text-sm text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: '#76b900' }}
            >
              Analyze
            </button>
          </div>

          {/* Demo URLs */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-600 font-mono">Try:</span>
            {DEMO_URLS.map(u => (
              <button
                key={u}
                onClick={() => { setUrl(u); handleAnalyze(u) }}
                className="text-xs font-mono text-gray-500 hover:text-[#76b900] underline underline-offset-2 transition-colors"
              >
                {u.replace('https://', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {state === 'error' && (
          <div className="mt-4 max-w-xl w-full bg-red-950/50 border border-red-800/50 rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-sm text-red-300 font-mono">
              <span className="font-bold text-red-400">Error: </span>{error}
            </p>
            {error.includes('NVIDIA_API_KEY') && (
              <p className="text-xs text-red-400/70 mt-2 font-mono">
                Add <code className="bg-red-900/40 px-1 rounded">NVIDIA_API_KEY=your_key</code> to <code className="bg-red-900/40 px-1 rounded">.env.local</code> and restart.
              </p>
            )}
          </div>
        )}

        {/* Feature pills */}
        <div
          className="flex flex-wrap gap-3 justify-center mt-10 max-w-2xl animate-fade-up"
          style={{ animationDelay: '0.2s' }}
        >
          {[
            { icon: '⬡', label: 'Agent 1: Crawls HTML', color: 'text-blue-400 border-blue-800/50 bg-blue-950/30' },
            { icon: '◎', label: 'Agent 2: Nemotron Analysis', color: 'text-[#76b900] border-[#76b900]/30 bg-[#76b900]/8' },
            { icon: '◈', label: 'Agent 3: Compliance Report', color: 'text-purple-400 border-purple-800/50 bg-purple-950/30' },
          ].map(f => (
            <div key={f.label} className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-mono ${f.color}`}>
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>

        {/* WCAG criteria chips */}
        <div
          className="mt-8 flex flex-wrap gap-2 justify-center max-w-2xl animate-fade-up"
          style={{ animationDelay: '0.3s' }}
        >
          <span className="text-xs text-gray-700 font-mono self-center mr-1">Checks:</span>
          {['1.1.1 Alt Text', '1.4.3 Contrast', '2.1.1 Keyboard', '2.4.4 Link Purpose', '3.3.2 Labels', '4.1.2 ARIA', '1.3.1 Structure', '2.4.6 Headings'].map(c => (
            <span key={c} className="text-xs font-mono px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 text-gray-600">
              {c}
            </span>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}

function Header() {
  return (
    <header className="border-b border-gray-800/60 bg-[#0a0a0a]/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-black font-bold text-sm"
               style={{ background: '#76b900' }}>
            ⊕
          </div>
          <span className="font-semibold text-gray-200 text-sm tracking-tight">
            WCAG 2.1 AA Accessibility Analyzer
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800">
            <div className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-black text-black"
                 style={{ background: '#76b900' }}>
              N
            </div>
            <span className="text-xs font-mono text-gray-500">Nemotron</span>
          </div>
          <span className="text-xs font-mono px-2 py-1 rounded bg-gray-900 border border-gray-800 text-gray-600">
            WCAG 2.1 AA
          </span>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-gray-800/40 py-5 text-center">
      <p className="text-xs font-mono text-gray-700">
        Built for{' '}
        <span style={{ color: '#76b900' }}>NVIDIA GTC Hackathon</span>
        {' '}— Agents for Impact
      </p>
    </footer>
  )
}
