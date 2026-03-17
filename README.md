# AccessGuard — WCAG 2.1 AA Accessibility Analyzer
### Built for NVIDIA GTC Hackathon · Agents for Impact

An AI-powered 3-agent system that crawls any website and delivers a full WCAG 2.1 AA compliance report with exact fix suggestions, powered by NVIDIA Nemotron.

---

## Quick Start (< 5 minutes)

### 1. Install dependencies
```bash
npm install
```

### 2. Add your NVIDIA API key
```bash
# Edit .env.local
NVIDIA_API_KEY=your_nvidia_api_key_here
```
Get your key at: https://integrate.api.nvidia.com

### 3. Run
```bash
npm run dev
# Open http://localhost:3000
```

---

## Architecture — 3-Agent Pipeline

```
User URL
   │
   ▼
┌─────────────────────────────────────────┐
│  AGENT 1: Crawler  (lib/crawler.ts)     │
│  • fetch() with browser User-Agent      │
│  • Cheerio HTML parsing                 │
│  • Extracts: images, buttons, links,    │
│    inputs, headings, videos, iframes    │
│  • Returns structured element list      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  AGENT 2: Analyzer  (lib/analyzer.ts)   │
│  • Batches elements (8 per call)        │
│  • Calls NVIDIA Nemotron per batch      │
│    Model: llama-3.1-nemotron-70b        │
│  • WCAG criteria checked:               │
│    1.1.1, 1.3.1, 1.4.1, 1.4.3, 1.4.4  │
│    2.1.1, 2.4.4, 2.4.6, 3.3.1, 3.3.2  │
│    4.1.2, 1.2.2                         │
│  • Returns violations with severity     │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  AGENT 3: Reporter  (lib/reporter.ts)   │
│  • Calculates compliance score (0-100) │
│  • Computes legal risk level            │
│  • Groups violations by WCAG criterion  │
│  • Calls Nemotron for executive summary │
│  • Returns full AnalysisResult JSON     │
└─────────────────────────────────────────┘
```

## WCAG Criteria Covered

| Criterion | Name | Level |
|-----------|------|-------|
| 1.1.1 | Non-text Content (alt text) | A |
| 1.3.1 | Info and Relationships | A |
| 1.4.1 | Use of Color | A |
| 1.4.3 | Contrast Minimum | AA |
| 1.4.4 | Resize Text | AA |
| 2.1.1 | Keyboard Accessibility | A |
| 2.4.4 | Link Purpose | AA |
| 2.4.6 | Headings and Labels | AA |
| 3.3.1 | Error Identification | A |
| 3.3.2 | Labels or Instructions | A |
| 4.1.2 | Name, Role, Value (ARIA) | A |
| 1.2.2 | Captions Prerecorded | A |

## API

### POST /api/analyze
```json
// Request
{ "url": "https://example.com" }

// Response
{
  "url": "https://example.com",
  "overallScore": 42,
  "grade": "D",
  "criticalCount": 4,
  "warningCount": 6,
  "legalRisk": "High",
  "legalRiskScore": 84,
  "summary": "Nemotron narrative...",
  "criterionGroups": [...],
  "allViolations": [...],
  "agentLog": [...]
}
```

## Demo Script (3 minutes)

1. **Open** `http://localhost:3000`
2. **Say:** *"4,000+ ADA lawsuits filed in 2024. Every one started with a site like this."*
3. **Enter** a URL with known issues (e.g. a basic HTML page)
4. **Watch** the 3-agent pipeline animate in real time
5. **Point to** the score, grade, and legal risk level
6. **Expand** a critical violation — show bad code vs. fixed code side by side
7. **Say:** *"Nemotron doesn't just find the problem. It tells you exactly what to change."*

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_API_KEY` | Yes | From https://integrate.api.nvidia.com |

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Cheerio** — server-side HTML parsing
- **OpenAI SDK** — NVIDIA-compatible client
- **NVIDIA Nemotron** — `llama-3.1-nemotron-70b-instruct`
