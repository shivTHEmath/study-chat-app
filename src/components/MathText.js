'use client'

import katex from 'katex'

// Matches LaTeX delimiters: $$..$$, \[..\], \(..\), $..$ (single-dollar inline)
// $$/$$ and \[/\] are checked first so they take priority over single $.
// Single $ requires non-space at both ends and no newline inside to avoid
// false-positives with currency like "$50".
const MATH_PATTERN =
  /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)[^\$\n]+?(?<!\s)\$)/g

export default function MathText({ text, className = '' }) {
  const segments = splitByMath(String(text || ''))

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'math' ? (
          <span
            key={i}
            className={seg.display ? 'block my-2 overflow-x-auto' : 'inline'}
            dangerouslySetInnerHTML={{ __html: renderMath(seg.value, seg.display) }}
          />
        ) : (
          <InlineMarkdown key={i} text={seg.value} />
        )
      )}
    </span>
  )
}

// Renders a plain-text segment with inline markdown support:
// **bold**, *italic*, and newlines → <br />.
// List markers ("- " at line start) are left as-is — restructuring them
// into <ul>/<li> would require re-joining segments split by math tokens,
// so they render as dashes for now and are still readable.
function InlineMarkdown({ text }) {
  const lines = text.split('\n')
  const result = []

  lines.forEach((line, li) => {
    if (li > 0) result.push(<br key={`br-${li}`} />)
    result.push(...parseBoldItalic(line, `l${li}`))
  })

  return <>{result}</>
}

// Splits a line into spans, <strong>, and <em> elements.
// **bold** is matched before *italic* so ** is never confused with *.
function parseBoldItalic(text, prefix) {
  const INLINE = /\*\*(.+?)\*\*|\*([^*]+?)\*/g
  const parts = []
  let last = 0
  let i = 0

  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) {
      parts.push(<span key={`${prefix}-t${i++}`}>{text.slice(last, match.index)}</span>)
    }
    if (match[1] !== undefined) {
      // **bold**
      parts.push(<strong key={`${prefix}-b${i++}`}>{match[1]}</strong>)
    } else {
      // *italic*
      parts.push(<em key={`${prefix}-e${i++}`}>{match[2]}</em>)
    }
    last = match.index + match[0].length
  }

  if (last < text.length) {
    parts.push(<span key={`${prefix}-t${i++}`}>{text.slice(last)}</span>)
  }

  return parts
}

function splitByMath(text) {
  const parts = []
  let lastIndex = 0

  for (const match of text.matchAll(MATH_PATTERN)) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }

    const token = match[0]
    const display = token.startsWith('$$') || token.startsWith('\\[')
    // Single $...$ is always inline
    parts.push({ type: 'math', display, value: unwrapMathToken(token) })
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return parts
}

function unwrapMathToken(token) {
  if (token.startsWith('$$')) return token.slice(2, -2)
  if (token.startsWith('\\[')) return token.slice(2, -2)
  if (token.startsWith('\\(')) return token.slice(2, -2)
  if (token.startsWith('$')) return token.slice(1, -1)  // single $...$
  return token
}

function renderMath(value, displayMode) {
  try {
    return katex.renderToString(value, {
      displayMode,
      throwOnError: false,
      strict: false,
    })
  } catch {
    return escapeHtml(value)
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
