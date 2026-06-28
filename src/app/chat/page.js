'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// Placeholder content. The problem and the tutor's replies will come from the
// backend later; for now the problem is static and replies are stubbed so the
// interface can be used and reviewed.
const PROBLEM =
  ''

const GREETING =
  "Hi! I'm here to help you work through this problem — not to hand you the " +
  'answer, but to think it through together. Take a look at it above, then tell ' +
  'me: what is the question actually asking you to find?'

// Stubbed, hint-style replies (the real tutor avoids giving direct answers).
// Replaced by the backend later.
const STUB_REPLIES = [

]

export default function ChatPage() {
  const router = useRouter()
  const [problemOpen, setProblemOpen] = useState(true)
  const [messages, setMessages] = useState([{ role: 'tutor', text: GREETING }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)

  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const replyCount = useRef(0)

  // Keep the conversation pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing])

  const autoGrow = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [])

  function send() {
    const text = input.trim()
    if (!text || typing) return

    setMessages((m) => [...m, { role: 'user', text }])
    setInput('')
    setTyping(true)
    requestAnimationFrame(autoGrow)

    // TODO: replace with a real request to the tutoring backend.
    const reply = STUB_REPLIES[replyCount.current % STUB_REPLIES.length]
    replyCount.current += 1
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'tutor', text: reply }])
      setTyping(false)
    }, 900)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-paper">
      {/* App header */}
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <span className="font-serif text-sm text-ink">AI Tutoring Study</span>
          <button
            onClick={() => router.push('/login')}
            className="text-xs font-medium text-muted hover:text-ink transition-colors"
          >
            End session
          </button>
        </div>
      </header>

      {/* Sticky, collapsible problem card */}
      <div className="shrink-0 bg-paper border-b border-line">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setProblemOpen((o) => !o)}
              aria-expanded={problemOpen}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="eyebrow">Problem</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`text-muted transition-transform ${problemOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {problemOpen ? (
              <p className="px-4 pb-4 -mt-1 text-[15px] text-ink leading-relaxed">{PROBLEM}</p>
            ) : (
              <p className="px-4 pb-3 -mt-1 text-sm text-muted truncate">{PROBLEM}</p>
            )}
          </div>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
          {messages.map((m, i) => (
            <Message key={i} role={m.role} text={m.text} />
          ))}
          {typing && <TypingIndicator />}
        </div>
      </div>

      {/* Composer */}
      <div
        className="shrink-0 border-t border-line bg-surface"
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              autoGrow()
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Type your thinking…"
            className="field resize-none max-h-[140px] flex-1"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || typing}
            aria-label="Send message"
            className="btn btn-primary h-11 w-11 shrink-0 rounded-full p-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function Message({ role, text }) {
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-white">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-sm text-white">
        T
      </span>
      <div className="max-w-[85%] sm:max-w-[78%]">
        <p className="mb-1 text-xs font-semibold text-muted">Tutor</p>
        <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-ink">
          {text}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-sm text-white">
        T
      </span>
      <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3">
        <span className="flex gap-1">
          <Dot delay="0ms" />
          <Dot delay="150ms" />
          <Dot delay="300ms" />
        </span>
      </div>
    </div>
  )
}

function Dot({ delay }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-faint animate-bounce"
      style={{ animationDelay: delay }}
    />
  )
}
