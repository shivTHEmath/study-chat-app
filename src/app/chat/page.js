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
  const [clockState, setClockState] = useState(null)          // returned by /api/chat
  const [pendingCheckinType, setPendingCheckinType] = useState(null)
  const [debugState, setDebugState] = useState(null)          // TESTING: runtime debug panel
  const [paused, setPaused] = useState(false)
  const [showIdleWarning, setShowIdleWarning] = useState(false)
  const [idleCountdown, setIdleCountdown] = useState(30)

  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const lastInteractionRef = useRef(Date.now())
  const pausedRef = useRef(false)

  // Client-side auth guard — fallback in case middleware is bypassed.
  // Middleware is the primary guard; this catches edge cases like a stale
  // cached page or a session that expired after the page loaded.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
    })
  }, [router])

  // Idle auto-logout — signs the student out after 30 minutes with no prompt
  // sent to the tutor, unless the session is paused. The timer resets only when
  // the student sends a message; mouse/keyboard activity does not count.
  // 30 seconds before logout, an "Are you still there?" warning appears.
  useEffect(() => {
    const IDLE_LOGOUT_MS = 30 * 60 * 1000
    const WARN_AT_MS = IDLE_LOGOUT_MS - 30 * 1000
    const id = setInterval(async () => {
      if (pausedRef.current) return
      const elapsed = Date.now() - lastInteractionRef.current
      if (elapsed >= IDLE_LOGOUT_MS) {
        clearInterval(id)
        setShowIdleWarning(false)
        const supabase = createClient()
        await supabase.auth.signOut()
        router.replace('/login')
      } else if (elapsed >= WARN_AT_MS) {
        setShowIdleWarning(true)
        setIdleCountdown(Math.ceil((IDLE_LOGOUT_MS - elapsed) / 1000))
      } else {
        setShowIdleWarning(false)
      }
    }, 1_000)
    return () => clearInterval(id)
  }, [router])

  // Keep a ref copy of paused so interval callbacks read the latest value.
  useEffect(() => { pausedRef.current = paused }, [paused])

  async function pauseSession() {
    setPaused(true)
    try {
      await fetch('/api/session/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: true }),
      })
    } catch { /* best-effort; UI still shows paused */ }
  }

  function confirmStillHere() {
    lastInteractionRef.current = Date.now()
    setShowIdleWarning(false)
  }

  async function resumeSession() {
    lastInteractionRef.current = Date.now()
    setPaused(false)
    try {
      await fetch('/api/session/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: false }),
      })
    } catch { /* best-effort */ }
  }

  // Idle check-in polling — runs every 30 s while the chat page is open.
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return
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

    lastInteractionRef.current = Date.now()  // reset idle-logout window
    setShowIdleWarning(false)
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
      if (data.clockState) {
        setClockState(data.clockState)
        // Clear local pendingCheckinType once the server has processed the reply.
        if (!data.clockState.pendingCheckinType) {
          setPendingCheckinType(null)
        }
      }

      if (data.message) {
        setMessages((m) => [...m, data.message])
      }

      // TESTING: capture runtime state for debug panel
      setDebugState({
        difficulty: data.runtime?.difficulty ?? '—',
        asValue: data.runtime?.asValue ?? null,
        hintCount: data.runtime?.hintCount ?? '—',
        maxHints: data.runtime?.maxHints ?? '—',
        hintAllowed: data.hintAllowed ?? false,
        hintsExhausted: data.hintsExhausted ?? false,
        isProblemComplete: data.isProblemComplete ?? false,
        initialDelay: data.runtime?.initialHintDelaySeconds ?? '—',
        midDelay: data.runtime?.midProblemDelaySeconds ?? '—',
        secSinceStart: data.runtime?.secondsSinceStarted ?? '—',
        secUntilHint: data.runtime?.secondsUntilHint ?? '—',
        nextHintAt: data.nextHintAvailableAt ?? null,
        engagedSec: data.clockState?.cumulativeEngagedSeconds ?? '—',
        attemptFound: data.debug?.attemptFound,
        conditionId: data.debug?.conditionId ?? '—',
        conditionSource: data.debug?.conditionSource ?? '—',
        baseAS: data.debug?.baseAS ?? null,
        sfrValue: data.debug?.sfrValue ?? null,
        fadeMultiplier: data.debug?.fadeMultiplier ?? null,
        engagedHours: data.debug?.engagedHours ?? null,
      })
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
          <div className="flex items-center gap-4">
            <button
              onClick={pauseSession}
              className="text-xs font-medium text-muted hover:text-ink transition-colors"
            >
              Pause session
            </button>
            <button
              onClick={() => router.push('/login')}
              className="text-xs font-medium text-muted hover:text-ink transition-colors"
            >
              End session
            </button>
          </div>
        </div>
      </header>

      {/* Paused overlay — blocks the session and stops the idle timer */}
      {paused && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95 backdrop-blur-sm">
          <div className="card max-w-sm mx-4 px-6 py-8 text-center">
            <p className="font-serif text-lg text-ink mb-1">Session paused</p>
            <p className="text-sm text-muted mb-6">
              Your time is not being counted. Resume whenever you are ready to continue.
            </p>
            <button onClick={resumeSession} className="btn btn-primary w-full h-11">
              Resume session
            </button>
          </div>
        </div>
      )}

      {/* Idle warning — appears 30s before auto-logout */}
      {showIdleWarning && !paused && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm">
          <div className="card max-w-xs mx-4 px-6 py-7 text-center animate-in">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <p className="font-serif text-lg text-ink mb-1">Are you still there?</p>
            <p className="text-sm text-muted mb-1">
              You will be signed out in
            </p>
            <p className="mb-6 font-serif text-3xl font-semibold tabular-nums text-primary">
              {idleCountdown}s
            </p>
            <button onClick={confirmStillHere} className="btn btn-primary w-full h-11">
              Yes, I&rsquo;m here
            </button>
          </div>
        </div>
      )}

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
            <Message key={i} role={m.role} text={m.text} tokens={m.tokens} />
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

      {/* TESTING: runtime debug panel */}
      {debugState && <DebugPanel state={debugState} />}
    </div>
  )
}

function DebugPanel({ state }) {
  const rows = [
    ['difficulty', state.difficulty],
    ['hint specificity', state.asValue != null ? `${Math.round(state.asValue)}%` : '—'],
    ['  ↳ condition', `#${state.conditionId} (${state.conditionSource})`],
    ['  ↳ attempt found', state.attemptFound ? '✓' : '✗ FALLBACK'],
    ['  ↳ base AS', state.baseAS != null ? Math.round(state.baseAS) : '—'],
    ['  ↳ sfr', state.sfrValue ?? '—'],
    ['  ↳ fade ×', state.fadeMultiplier != null ? state.fadeMultiplier.toFixed(3) : '—'],
    ['  ↳ engaged hrs', state.engagedHours != null ? state.engagedHours.toFixed(2) : '—'],
    ['hints', `${state.hintCount} / ${state.maxHints}`],
    ['hint allowed', state.hintAllowed ? '✓' : '✗'],
    ['hints exhausted', state.hintsExhausted ? '✓' : '✗'],
    ['problem complete', state.isProblemComplete ? '✓' : '✗'],
    ['initial delay', `${state.initialDelay}s`],
    ['mid delay', `${state.midDelay}s`],
    ['sec since start', state.secSinceStart],
    ['sec until hint', state.secUntilHint],
    ['engaged sec', state.engagedSec],
  ]
  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: 8,
      zIndex: 50,
      background: 'rgba(0,0,0,0.78)',
      color: '#a3e635',
      fontFamily: 'monospace',
      fontSize: 10,
      lineHeight: 1.5,
      borderRadius: 6,
      padding: '6px 10px',
      pointerEvents: 'none',
      maxWidth: 180,
    }}>
      <div style={{ color: '#facc15', fontWeight: 700, marginBottom: 3 }}>⚙ debug</div>
      {rows.map(([k, v]) => (
        <div key={k}>
          <span style={{ color: '#94a3b8' }}>{k}: </span>{String(v)}
        </div>
      ))}
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

function Message({ role, text, tokens }) {
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
        {tokens && (tokens.input != null || tokens.output != null) && (
          <p className="mt-1 text-[10px] font-mono text-faint">
            {tokens.input ?? '?'} in / {tokens.output ?? '?'} out tokens
          </p>
        )}
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
