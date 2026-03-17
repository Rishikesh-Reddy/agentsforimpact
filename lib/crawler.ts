import { load } from 'cheerio'
import type { Element, AnyNode } from 'domhandler'
import type { ExtractedElement, AgentLogEntry } from './types'

const MAX_ELEMENTS = 60

export async function crawlUrl(url: string, log: AgentLogEntry[], prefetchedHtml?: string): Promise<{
  elements: ExtractedElement[]
  pageTitle: string
  rawHtml: string
}> {
  const t = Date.now()

  log.push({ agent: 'Crawler', step: 'Fetching HTML', detail: url, timestamp: t })

  let html: string
  let fetchMethod = 'direct'

  // If the browser already fetched the HTML (bypassing server-side 403s), use it directly
  if (prefetchedHtml && prefetchedHtml.length > 500) {
    html = prefetchedHtml
    fetchMethod = 'browser-prefetch'
    log.push({ agent: 'Crawler', step: 'Using browser-fetched HTML', detail: `${Math.round(html.length / 1024)}KB`, timestamp: Date.now() })
  } else {
    // Strategy 1: direct server-side fetch with realistic browser headers
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      html = await res.text()
    } catch (directErr: unknown) {
      const directMsg = directErr instanceof Error ? directErr.message : String(directErr)
      log.push({ agent: 'Crawler', step: 'Direct fetch blocked', detail: `${directMsg} — trying proxies`, timestamp: Date.now() })

      // Strategy 2: allorigins.win
      try {
        fetchMethod = 'allorigins'
        const proxyRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
          signal: AbortSignal.timeout(20000),
        })
        if (!proxyRes.ok) throw new Error(`Proxy HTTP ${proxyRes.status}`)
        const proxyData = await proxyRes.json() as { contents?: string }
        if (!proxyData.contents) throw new Error('Proxy returned empty contents')
        html = proxyData.contents
      } catch (proxyErr: unknown) {
        const proxyMsg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr)

        // Strategy 3: corsproxy.io
        try {
          fetchMethod = 'corsproxy'
          const corsRes = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AccessGuard/1.0)' },
            signal: AbortSignal.timeout(20000),
          })
          if (!corsRes.ok) throw new Error(`corsproxy HTTP ${corsRes.status}`)
          html = await corsRes.text()
        } catch (corsErr: unknown) {
          const corsMsg = corsErr instanceof Error ? corsErr.message : String(corsErr)
          // All server-side strategies failed — signal to frontend to try browser fetch
          throw new Error(
            `FETCH_BLOCKED:${url}|Direct: ${directMsg} | allorigins: ${proxyMsg} | corsproxy: ${corsMsg}`
          )
        }
      }
    }
  }

  if (fetchMethod !== 'browser-prefetch') {
    log.push({ agent: 'Crawler', step: 'HTML fetched', detail: `${Math.round(html.length / 1024)}KB via ${fetchMethod}`, timestamp: Date.now() })
  }

  // Guard: detect proxy/server error pages before wasting Nemotron calls on them
  const errorPagePatterns = [
    /\b(400|403|404|500|502|503)\s+(bad request|forbidden|not found|error|gateway|unavailable)/i,
    /<title>[^<]*(error|not found|forbidden|bad request|access denied)[^<]*<\/title>/i,
    /cloudflare.*ray id/i,
    /this page (isn't|is not) (working|available)/i,
  ]
  const htmlPreview = html.slice(0, 2000)
  const isErrorPage = errorPagePatterns.some(p => p.test(htmlPreview))
  if (isErrorPage) {
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i)
    const errorTitle = titleMatch?.[1]?.trim() ?? 'Unknown error'
    throw new Error(
      `FETCH_BLOCKED:${url}|The proxy returned an error page ("${errorTitle}") instead of the actual site. ` +
      `Try using the "Paste HTML" option: open ${url} in your browser, press Ctrl+U to view source, and paste the HTML.`
    )
  }

  const $ = load(html)
  const pageTitle = $('title').text().trim() || url
  const elements: ExtractedElement[] = []

  function truncate(s: string, n = 300): string {
    s = (s ?? '').replace(/\s+/g, ' ').trim()
    return s.length > n ? s.slice(0, n) + '…' : s
  }

  function getAttrs(el: Element): Record<string, string> {
    const attrs: Record<string, string> = {}
    if (el.type === 'tag' && el.attribs) {
      for (const [k, v] of Object.entries(el.attribs)) {
        if (v !== undefined) attrs[k] = String(v).slice(0, 300)
      }
    }
    return attrs
  }

  function outerHtml(el: AnyNode): string {
    return truncate($.html(el) ?? '', 300)
  }

  // ── FIX 1: Images — send full attributes so model can judge alt quality ──
  // Bad alt text (empty string on functional image, "bullet", "image",
  // overly-verbose, filename-based) must reach the model — don't filter here.
  $('img').each((_, el) => {
    if (elements.length >= MAX_ELEMENTS) return false
    const attrs  = getAttrs(el as Element)
    const alt    = attrs.alt
    const src    = attrs.src ?? ''
    const parent = $(el).parent()
    const parentTag  = (parent[0] as Element)?.name ?? ''
    const parentHref = parent.attr('href') ?? ''
    const siblingText = parentTag === 'a' ? truncate(parent.clone().children('img').remove().end().text()) : ''

    // FIX: flag suspicious alt values explicitly so model has full context
    let altQuality = 'present'
    if (alt === undefined || alt === null) {
      altQuality = 'MISSING — no alt attribute at all'
    } else if (alt === '') {
      altQuality = parentTag === 'a' && !siblingText
        ? 'EMPTY on image-only link — link has no accessible name (WCAG 2.4.4 + 4.1.2 failure)'
        : 'empty (decorative marker)'
    } else if (/^\d[\d\s]+$/.test(alt)) {
      altQuality = `SUSPICIOUS — alt is a number ("${alt}"), likely a placeholder`
    } else if (/\.(gif|jpg|jpeg|png|webp|svg)$/i.test(alt)) {
      altQuality = `SUSPICIOUS — alt looks like a filename ("${alt}")`
    } else if (alt.toLowerCase() === 'image' || alt.toLowerCase() === 'bullet' || alt.toLowerCase() === 'spacer' || alt.toLowerCase() === 'photo') {
      altQuality = `SUSPICIOUS — alt is a generic non-descriptive word ("${alt}")`
    } else if (alt.length > 150) {
      altQuality = `SUSPICIOUS — alt is overly verbose (${alt.length} chars). Should be a concise equivalent, not a paragraph`
    }

    elements.push({
      type: 'image',
      html: outerHtml(el),
      selector: 'img',
      attributes: attrs,
      textContent: alt ?? '',
      context: [
        `alt quality: ${altQuality}`,
        parentTag === 'a' ? `inside link (href="${parentHref}", sibling text="${siblingText}")` : '',
      ].filter(Boolean).join(' | '),
    })
  })

  // ── FIX 2: CSS background images — invisible to naive crawlers ──
  // The W3C BAD demo hides content in background-image divs (e.g. BrainInJar.jpg)
  $('[style*="background"]').each((_, el) => {
    if (elements.length >= MAX_ELEMENTS) return false
    const style = $(el).attr('style') ?? ''
    const bgMatch = style.match(/background(?:-image)?\s*:\s*url\((['"]?)([^)'"]+)\1\)/i)
    if (!bgMatch) return
    const imageUrl = bgMatch[2]
    const titleAttr = $(el).attr('title') ?? ''
    const ariaLabel = $(el).attr('aria-label') ?? ''
    const role      = $(el).attr('role') ?? ''
    const text      = truncate($(el).text())
    elements.push({
      type: 'image',
      html: outerHtml(el),
      selector: '[style*="background"]',
      attributes: getAttrs(el as Element),
      textContent: text,
      context: `CSS background-image: url(${imageUrl}). title="${titleAttr}", aria-label="${ariaLabel}", role="${role}", visible text="${text}". WCAG 1.1.1: if this image conveys information it needs a text alternative — title alone is NOT sufficient.`,
    })
  })

  // ── FIX 3: Links — expanded to 25, include full inner HTML for image-only detection ──
  $('a[href]').slice(0, 25).each((_, el) => {
    if (elements.length >= MAX_ELEMENTS) return false
    const visibleText = truncate($(el).text())
    const imgs        = $(el).find('img')
    const imgAlts     = imgs.map((_, img) => $(img).attr('alt') ?? 'NO_ALT').get()
    const hasOnlyImg  = imgs.length > 0 && !visibleText.trim()
    const ariaLabel   = $(el).attr('aria-label') ?? ''
    const title       = $(el).attr('title') ?? ''

    // Evaluate image-only link accessible name quality
    let linkContext = ''
    if (hasOnlyImg) {
      const firstAlt = imgAlts[0] ?? ''
      if (firstAlt === '' || firstAlt === 'NO_ALT') {
        linkContext = `CRITICAL: Image-only link with empty/missing alt — no accessible name at all (WCAG 2.4.4 F89)`
      } else if (ariaLabel || title) {
        linkContext = `PASS: Image-only link has accessible name via ${ariaLabel ? `aria-label="${ariaLabel}"` : `title="${title}"`}`
      } else {
        // Evaluate alt text quality for the link context
        // A logo/brand image alt like "W3C logo", "BBC logo" IS sufficient for link purpose
        // when the link goes to that org's homepage — the destination is clear
        const looksDescriptive =
          firstAlt.length >= 4 &&
          !['image','photo','icon','logo only','graphic','img'].includes(firstAlt.toLowerCase()) &&
          !/^\d+$/.test(firstAlt)
        if (looksDescriptive) {
          linkContext = `PASS: Image-only link — alt="${firstAlt}" provides an accessible name. Minor: consider if alt describes link destination (not just image content).`
        } else {
          linkContext = `WARNING: Image-only link — alt="${firstAlt}" is too generic to describe the link's destination (WCAG 2.4.4)`
        }
      }
    }

    // Only flag genuinely non-descriptive visible text
    const NONDESCRIPTIVE = new Set(['read more...', 'read more', 'click here', 'more', 'here', 'link', 'this', 'details'])
    const visibleLower = visibleText.trim().toLowerCase()
    if (!hasOnlyImg && NONDESCRIPTIVE.has(visibleLower)) {
      linkContext = `WARNING: non-descriptive link text "${visibleText}" — violates WCAG 2.4.4 F84`
    }

    elements.push({
      type: 'link',
      html: outerHtml(el),
      selector: 'a',
      attributes: getAttrs(el as Element),
      textContent: visibleText,
      context: [
        linkContext,
        imgs.length > 0 && !linkContext ? `Contains ${imgs.length} image(s) with alt: [${imgAlts.join(', ')}]` : '',
      ].filter(Boolean).join(' | '),
    })
  })

  // ── 4. Buttons ──
  $('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]').each((_, el) => {
    if (elements.length >= MAX_ELEMENTS) return false
    elements.push({
      type: 'button',
      html: outerHtml(el),
      selector: (el as Element).name ?? 'button',
      attributes: getAttrs(el as Element),
      textContent: truncate($(el).text()),
    })
  })

  // ── 5. Form inputs with label resolution ──
  $('input, textarea, select').each((_, el) => {
    if (elements.length >= MAX_ELEMENTS) return false
    const id          = $(el).attr('id') ?? ''
    const name        = $(el).attr('name') ?? ''
    const labelByFor  = id ? $(`label[for="${id}"]`).text().trim() : ''
    const ariaLabel   = $(el).attr('aria-label') ?? ''
    const ariaLabelBy = $(el).attr('aria-labelledby') ?? ''
    const placeholder = $(el).attr('placeholder') ?? ''

    const hasAccessibleName = !!(labelByFor || ariaLabel || ariaLabelBy)

    elements.push({
      type: 'input',
      html: outerHtml(el),
      selector: (el as Element).name ?? 'input',
      attributes: getAttrs(el as Element),
      textContent: labelByFor || ariaLabel || placeholder || '',
      context: hasAccessibleName
        ? `Accessible name found: label="${labelByFor}", aria-label="${ariaLabel}", aria-labelledby="${ariaLabelBy}"`
        : `NO ACCESSIBLE NAME — id="${id}", name="${name}", placeholder="${placeholder}". No <label for>, no aria-label, no aria-labelledby. This is a WCAG 3.3.2 + 1.3.1 failure.`,
    })
  })

  // ── 6. Headings — full sequence for hierarchy check ──
  const headings: { level: number; text: string; html: string }[] = []
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    headings.push({
      level: parseInt((el as Element).name.replace('h', '')),
      text: truncate($(el).text()),
      html: outerHtml(el),
    })
  })

  // FIX: also detect visually-styled headings that are NOT using heading elements
  const fakeHeadings: string[] = []
  $('[class*="title"], [class*="heading"], [class*="header"], [id*="title"], [id*="heading"]').each((_, el) => {
    const tag = (el as Element).name
    if (!['h1','h2','h3','h4','h5','h6'].includes(tag)) {
      const text = truncate($(el).text(), 60)
      if (text.length > 2 && text.length < 80) fakeHeadings.push(`<${tag} class="${$(el).attr('class') ?? ''}">${text}</${tag}>`)
    }
  })

  elements.push({
    type: 'heading',
    html: headings.slice(0, 12).map(h => h.html).join('\n'),
    selector: 'h1-h6',
    attributes: {},
    textContent: headings.map(h => `h${h.level}: ${h.text}`).join(' | '),
    context: [
      `Heading sequence: ${headings.length > 0 ? headings.map(h => `H${h.level}`).join(' → ') : 'NO HEADINGS FOUND — entire page has no heading structure'}`,
      fakeHeadings.length > 0 ? `Possible fake headings (styled divs/spans, not semantic h elements): ${fakeHeadings.slice(0, 4).join(', ')}` : '',
    ].filter(Boolean).join(' | '),
  })

  // ── FIX 4: Layout tables — critical 1.3.1 signal ──
  let tableIndex = 0
  $('table').each((_, el) => {
    if (elements.length >= MAX_ELEMENTS || tableIndex >= 4) return false
    tableIndex++
    const hasCaption  = $(el).find('caption').length > 0
    const hasScope    = $(el).find('[scope]').length > 0
    const hasTh       = $(el).find('th').length > 0
    const hasSummary  = !!($(el).attr('summary') ?? '')
    const cellCount   = $(el).find('td').length
    const nestedTable = $(el).find('table').length > 0

    // Heuristic: layout table if large, no headers, no caption, no summary
    const likelyLayout = cellCount > 4 && !hasTh && !hasCaption && !hasSummary

    elements.push({
      type: 'table',
      html: outerHtml(el),
      selector: 'table',
      attributes: getAttrs(el as Element),
      context: [
        `Has caption: ${hasCaption}, Has th: ${hasTh}, Has scope: ${hasScope}, Has summary: ${hasSummary}`,
        `Cell count: ${cellCount}, Nested tables: ${nestedTable}`,
        likelyLayout ? 'LIKELY LAYOUT TABLE — using <table> for visual layout instead of data violates WCAG 1.3.1 (reading order breaks for screen readers)' : 'Appears to be a data table',
      ].join(' | '),
    })
  })

  // ── 7. Videos ──
  $('video').each((_, el) => {
    if (elements.length >= MAX_ELEMENTS) return false
    elements.push({
      type: 'video',
      html: outerHtml(el),
      selector: 'video',
      attributes: getAttrs(el as Element),
    })
  })

  // ── 8. Iframes ──
  $('iframe').each((_, el) => {
    if (elements.length >= MAX_ELEMENTS) return false
    elements.push({
      type: 'iframe',
      html: outerHtml(el),
      selector: 'iframe',
      attributes: getAttrs(el as Element),
    })
  })

  // ── 9. Inline color styles — contrast hints ──
  let colorCount = 0
  $('[style*="color"]').each((_, el) => {
    if (elements.length >= MAX_ELEMENTS || colorCount >= 4) return false
    const style = $(el).attr('style') ?? ''
    if (style.match(/color\s*:\s*#[a-f0-9]{3,6}/i)) {
      colorCount++
      elements.push({
        type: 'custom',
        html: outerHtml(el),
        selector: '[style*="color"]',
        attributes: { style },
        textContent: truncate($(el).text()),
        context: `Inline color style detected. Check contrast ratio. Common failure: light gray on white (#aaa on #fff = 2.3:1, needs 4.5:1)`,
      })
    }
  })

  // ── FIX 5: Page-level structural analysis ──
  // Sends one element that captures global issues the element-by-element
  // scan would otherwise miss: lang attribute, skip nav, page title quality
  const htmlEl      = $('html')
  const langAttr    = htmlEl.attr('lang') ?? ''
  const hasSkipNav  = $('a[href^="#"]').length > 0
  const metaViewport = $('meta[name="viewport"]').attr('content') ?? ''
  const hasMainLandmark = $('main, [role="main"]').length > 0
  const hasNavLandmark  = $('nav, [role="navigation"]').length > 0
  const pageTitleText   = $('title').text().trim()
  const totalImgsNoAlt  = $('img:not([alt])').length
  const totalImgs       = $('img').length

  elements.push({
    type: 'custom',
    html: `<html lang="${langAttr}">…page structure…</html>`,
    selector: 'html (page-level)',
    attributes: { lang: langAttr },
    textContent: pageTitleText,
    context: [
      `lang attribute: ${langAttr ? `"${langAttr}" ✓` : 'MISSING — violates WCAG 3.1.1'}`,
      `Page <title>: ${pageTitleText ? `"${pageTitleText}"` : 'MISSING — violates WCAG 2.4.2'}`,
      `Skip navigation link: ${hasSkipNav ? 'present' : 'NOT FOUND — keyboard users must tab through all nav to reach content (WCAG 2.4.1)'}`,
      `<main> landmark: ${hasMainLandmark ? 'present' : 'missing'}`,
      `<nav> landmark: ${hasNavLandmark ? 'present' : 'missing'}`,
      `meta viewport: ${metaViewport || 'not set'}`,
      `Images missing alt: ${totalImgsNoAlt} of ${totalImgs} total`,
    ].join(' | '),
  })

  log.push({
    agent: 'Crawler',
    step: 'Elements extracted',
    detail: `${elements.length} elements — ${$('img').length} imgs (${totalImgsNoAlt} no-alt), ${$('a').length} links, ${$('input,textarea,select').length} inputs, ${$('table').length} tables`,
    timestamp: Date.now(),
  })

  return { elements, pageTitle, rawHtml: html.slice(0, 800) }
}
