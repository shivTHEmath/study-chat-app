'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MathText from '@/components/MathText'
import { shouldTriggerCheckin, checkinMessageFor } from '@/lib/tutor/engagementClock'
import { createClient } from '@/lib/supabase/client'

export default function ChatPage() {
  const router = useRouter()
  const [problem, setProblem] = useState('')
  const [problemOpen, setProblemOpen] = useState(true)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [attemptId, setAttemptId] = useState(null)
  const [sending, setSending] = useState(false)
  const [problemPending, setProblemPending] = useState(false)
  const [error, setError] = useState('')
  const [hintAllowed, setHintAllowed] = useState(null)        // null = no attempt yet
  const [nextHintAvailableAt, setNextHintAvailableAt] = useState(null)
  const [clockState, setClockState] = useState(null)          // returned by /api/chat
  const [pendingCheckinType, setPendingCheckinType] = useState(null)

  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  // Client-side auth guard — fallback in case middleware is bypassed.
  // Middleware is the primary guard; this catches edge cases like a stale
  // cached page or a session that expired after the page loaded.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
    })
  }, [router])

  // Idle check-in polling — runs every 30 s while the chat page is open.
  useEffect(() => {
    const id = setInterval(() => {
      if (!clockState || pendingCheckinType) return
      const hasActiveProblem = Boolean(problem && !problemPending)
      if (shouldTriggerCheckin(
        {
          last_activity_at: clockState.lastActivityAt,
          clock_paused_at: clockState.clockPausedAt,
          pending_checkin_type: clockState.pendingCheckinType,
        },
        hasActiveProblem
      )) {
        const { type, message: checkinMsg } = checkinMessageFor(hasActiveProblem)
        setPendingCheckinType(type)
        setMessages((m) => [...m, { role: 'system', text: checkinMsg }])
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [clockState, pendingCheckinType, problem, problemPending])

  // Keep the conversation pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const autoGrow = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || sending) return

    setError('')
    setSending(true)
    if (!problem) {
      setProblemPending(true)
      setProblemOpen(true)
      setInput('')
      requestAnimationFrame(autoGrow)

      await requestTutorMessage({
        problemText: text,
        studentMessage: text,
        phase: 'new_problem',
        nextMessages: [],
      })
    } else {
      const nextMessages = [...messages, { role: 'user', text }]
      setMessages(nextMessages)
      setInput('')
      requestAnimationFrame(autoGrow)

      await requestTutorMessage({
        problemText: problem,
        studentMessage: text,
        phase: 'follow_up',
        nextMessages,
      })
    }

    setSending(false)
  }

  async function requestTutorMessage({
    problemText,
    studentMessage,
    phase,
    nextMessages,
  }) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: problemText,
          studentMessage,
          attemptId,
          phase,
          pendingCheckinType,
          secondsSinceProblemStarted: 0,
          conversation: nextMessages,
        }),
      })

      const data = await readJsonResponse(response)

      if (!response.ok) {
        throw new Error(data?.error || 'The tutor could not respond. Please try again.')
      }

      if (phase === 'new_problem' && data.displayProblem) {
        setProblem(data.displayProblem)
        setProblemPending(false)
      }
      if (data.attemptId) {
        setAttemptId(data.attemptId)
      }
      if (data.hintAllowed !== undefined) {
        setHintAllowed(data.hintAllowed)
      }
      if (data.nextHintAvailableAt !== undefined) {
        setNextHintAvailableAt(data.nextHintAvailableAt)
      }
      if (data.clockState) {
        setClockState(data.clockState)
        // Clear local pendingCheckinType once the server has processed the reply.
        if (!data.clockState.pendingCheckinType) {
          setPendingCheckinType(null)
        }
      }

      // Wait messages (hint requested but delay not yet elapsed) are handled
      // by the countdown in the problem card — no need for a chat bubble too.
      if (!data.isWaitMessage) {
        setMessages((m) => [...m, data.message])
      }
    } catch (err) {
      setError(err.message || 'The tutor could not respond. Please try again.')
      if (phase === 'new_problem') {
        setProblemPending(false)
      }
    } finally {
      setSending(false)
    }
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
      <div className="sticky top-0 z-10 shrink-0 bg-paper border-b border-line">
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
              <div className="px-4 pb-4 -mt-1">
                <p className={`text-[15px] leading-relaxed ${problem ? 'text-ink' : 'text-muted'}`}>
                  <MathText text={getProblemText({ problem, problemPending })} />
                </p>
                <HintStatus hintAllowed={hintAllowed} nextHintAvailableAt={nextHintAvailableAt} />
              </div>
            ) : (
              <p className="px-4 pb-3 -mt-1 text-sm text-muted truncate">
                <MathText text={getProblemText({ problem, problemPending })} />
              </p>
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
          {sending && <TypingIndicator />}
          {error && (
            <div className="rounded-md border border-danger/30 bg-surface px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
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
            placeholder="Enter your question"
            className="field resize-none max-h-[140px] flex-1"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim() || sending}
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

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return {
      error: response.ok
        ? 'The tutor returned an unreadable response.'
        : 'The tutor service returned an unexpected error.',
    }
  }
}

function getProblemText({ problem, problemPending }) {
  if (problem) return problem
  if (problemPending) return 'Preparing your problem...'
  return 'Enter your question below.'
}

function Message({ role, text }) {
  // System messages (idle check-ins) appear as a centred, muted notice.
  if (role === 'system') {
    return (
      <div className="flex justify-center">
        <p className="text-xs text-muted bg-surface border border-line rounded-full px-4 py-1.5">
          {text}
        </p>
      </div>
    )
  }

  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-white">
          <MathText text={text} />
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
          <MathText text={text} />
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

// Shows hint availability beneath the problem text.
// - null: no attempt yet — renders nothing.
// - hintAllowed=true: green "hint available" prompt.
// - hintAllowed=false: live countdown ticking down to nextHintAvailableAt.
//   When the countdown reaches 0 it flips to the "available" state locally
//   without waiting for the next API response.
function HintStatus({ hintAllowed, nextHintAvailableAt }) {
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [locallyAvailable, setLocallyAvailable] = useState(false)

  useEffect(() => {
    setLocallyAvailable(false)

    if (hintAllowed || !nextHintAvailableAt) {
      setSecondsLeft(null)
      return
    }

    function tick() {
      const diff = Math.max(0, Math.ceil((new Date(nextHintAvailableAt) - Date.now()) / 1000))
      setSecondsLeft(diff)
      if (diff === 0) setLocallyAvailable(true)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [hintAllowed, nextHintAvailableAt])

  if (hintAllowed === null) return null

  if (hintAllowed || locallyAvailable) {
    return (
      <p className="mt-2 text-xs font-medium text-primary">
        Hint available — type &ldquo;hint&rdquo; to ask
      </p>
    )
  }

  if (secondsLeft === null) return null

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const formatted = `${mins}:${String(secs).padStart(2, '0')}`

  return (
    <p className="mt-2 text-xs text-muted">
      Next hint in{' '}
      <span className="font-medium tabular-nums">{formatted}</span>
    </p>
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
