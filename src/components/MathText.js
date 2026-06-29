'use client'

import katex from 'katex'

const TOKEN_PATTERN = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g

export default function MathText({ text, className = '' }) {
  const parts = splitMathText(text)

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.type === 'math') {
          return (
            <span
              key={index}
              className={part.display ? 'block my-2 overflow-x-auto' : 'inline'}
              dangerouslySetInnerHTML={{ __html: renderMath(part.value, part.display) }}
            />
          )
        }

        return <span key={index}>{part.value}</span>
      })}
    </span>
  )
}

function splitMathText(text = '') {
  const parts = []
  let lastIndex = 0

  for (const match of String(text).matchAll(TOKEN_PATTERN)) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }

    const token = match[0]
    const display = token.startsWith('$$') || token.startsWith('\\[')
    parts.push({
      type: 'math',
      display,
      value: unwrapMathToken(token),
    })
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
