'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import MathText from '@/components/MathText'
import { shouldTriggerCheckin, checkinMessageFor } from '@/lib/tutor/engagementClock'
import { createClient } from '@/lib/supabase/client'

const GOAL_SECONDS = 10 * 3600 // 10 hours
const MILESTONES_H = [2, 4, 6, 8, 10]

export default function ChatPage() {
  const router = useRouter()
  const [problem, setProblem] = useState('')
  const [problemOpen, setProblemOpen] = useState(true)
  const [problemComplete, setProblemComplete] = useState(false)
  const [reflectionPending, setReflectionPending] = useState(false) // a reflection prompt is awaiting the student's answer; hold here
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [attemptId, setAttemptId] = useState(null)
  const [sending, setSending] = useState(false)
  const [problemPending, setProblemPending] = useState(false)
  const [error, setError] = useState('')
  const [clockState, setClockState] = useState(null)
  const [pendingCheckinType, setPendingCheckinType] = useState(null)
  const [problemsCompleted, setProblemsCompleted] = useState(0)
  const [cumulativeSeconds, setCumulativeSeconds] = useState(0)
  const [celebrating, setCelebrating] = useState(false)
  const [neighborhood, setNeighborhood] = useState([])
  const [rankTotal, setRankTotal] = useState(0)
  const [nextHintAt, setNextHintAt] = useState(null)      // ISO string — when next hint unlocks
  const [hintAllowed, setHintAllowed] = useState(false)   // true = hint can be requested now
  const [hintsExhausted, setHintsExhausted] = useState(false)
  const [topicBands, setTopicBands] = useState([])        // tiles from /api/suggest GET
  const [activeTopic, setActiveTopic] = useState(null)    // topic the kid tapped
  const [suggestions, setSuggestions] = useState(null)    // 3 problems from the bank
  const [suggestLoading, setSuggestLoading] = useState(false)

  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  // Client-side auth guard
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/login')
    })
  }, [router])

  const fetchRanking = useCallback(() => {
    fetch('/api/ranking')
      .then((r) => r.json())
      .then((d) => {
        setNeighborhood(d.neighborhood || [])
        setRankTotal(d.total || 0)
      })
      .catch(() => {})
  }, [])

  // Load initial progress + ranking on mount
  useEffect(() => {
    fetch('/api/progress')
      .then((r) => r.json())
      .then((d) => {
        setProblemsCompleted(Number(d.problemsCompleted || 0))
        setCumulativeSeconds(Number(d.cumulativeEngagedSeconds || 0))
      })
      .catch(() => {})
    fetchRanking()
    fetch('/api/suggest')
      .then((r) => r.json())
      .then((d) => setTopicBands(d.bands || []))
      .catch(() => {})
  }, [fetchRanking])

  // Refresh ranking after each problem solved (time goes up → rank may change)
  useEffect(() => {
    if (problemsCompleted > 0) fetchRanking()
  }, [problemsCompleted, fetchRanking])

  // Keep cumulativeSeconds in sync with clockState updates from the API
  useEffect(() => {
    if (clockState?.cumulativeEngagedSeconds != null) {
      setCumulativeSeconds(Number(clockState.cumulativeEngagedSeconds))
    }
  }, [clockState])

  // Idle check-in polling
  useEffect(() => {
    const id = setInterval(() => {
      if (!clockState || pendingCheckinType) return
      const hasActiveProblem = Boolean(problem && !problemPending)
      if (
        shouldTriggerCheckin(
          {
            last_activity_at: clockState.lastActivityAt,
            clock_paused_at: clockState.clockPausedAt,
            pending_checkin_type: clockState.pendingCheckinType,
          },
          hasActiveProblem
        )
      ) {
        const { type, message: checkinMsg } = checkinMessageFor(hasActiveProblem)
        setPendingCheckinType(type)
        setMessages((m) => [...m, { role: 'system', text: checkinMsg }])
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [clockState, pendingCheckinType, problem, problemPending])

  // Scroll to latest message
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Auto-dismiss celebration after 2.5 s
  useEffect(() => {
    if (!celebrating) return
    const t = setTimeout(() => setCelebrating(false), 2500)
    return () => clearTimeout(t)
  }, [celebrating])

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

    // A finished problem normally means the next message starts a new one — but
    // NOT while a reflection prompt is still pending. Then this message is the
    // student's answer to the reflection, so keep it as a follow-up.
    const isNewProblem = (!problem || problemComplete) && !reflectionPending

    if (isNewProblem) {
      if (problemComplete) {
        setProblemComplete(false)
        setProblem('')
        setAttemptId(null)
        setMessages([])
      }
      // Reset hint state for the new problem
      setNextHintAt(null)
      setHintAllowed(false)
      setHintsExhausted(false)
      // Typing your own problem dismisses the topic picker
      setActiveTopic(null)
      setSuggestions(null)
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

  // Fetches 3 bank questions (easy/medium/challenge) for a tapped topic.
  async function chooseTopic(topic) {
    setActiveTopic(topic)
    setSuggestLoading(true)
    setSuggestions(null)
    try {
      const r = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: topic.id }),
      })
      const d = await r.json()
      setSuggestions(Array.isArray(d.problems) && d.problems.length ? d.problems : null)
    } catch {
      setSuggestions(null)
    }
    setSuggestLoading(false)
  }

  // Starts a suggested question as a normal new problem.
  async function startSuggested(text) {
    if (sending) return
    setError('')
    setSending(true)
    if (problemComplete) {
      setProblemComplete(false)
      setProblem('')
      setAttemptId(null)
      setMessages([])
    }
    setNextHintAt(null)
    setHintAllowed(false)
    setHintsExhausted(false)
    setActiveTopic(null)
    setSuggestions(null)
    setProblemPending(true)
    setProblemOpen(true)
    await requestTutorMessage({
      problemText: text,
      studentMessage: text,
      phase: 'new_problem',
      nextMessages: [],
    })
    setSending(false)
  }

  async function requestTutorMessage({ problemText, studentMessage, phase, nextMessages }) {
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
      if (data.attemptId) setAttemptId(data.attemptId)
      if (data.clockState) {
        setClockState(data.clockState)
        if (!data.clockState.pendingCheckinType) setPendingCheckinType(null)
      }

      // Hold the student on the reflection (no picker, no new problem) until the
      // server says it is resolved. Absent on new-problem responses -> false.
      setReflectionPending(Boolean(data.reflectionPending))

      if (data.isProblemComplete) {
        // Count + celebrate only the FIRST time an attempt completes. The model
        // re-reports isProblemComplete on later reflection turns; guarding on the
        // prior state stops the local counter and confetti from firing twice.
        if (!problemComplete) {
          setProblemsCompleted((n) => n + 1)
          setCelebrating(true)
        }
        setProblemComplete(true)
        setNextHintAt(null)
        setHintAllowed(false)
      }

      // Sync hint countdown from every API response
      if (!data.isProblemComplete) {
        setHintAllowed(Boolean(data.hintAllowed))
        setHintsExhausted(Boolean(data.hintsExhausted))
        setNextHintAt(data.nextHintAvailableAt ?? null)
      }

      if (data.message) {
        setMessages((m) => [...m, data.message])
      }
    } catch (err) {
      setError(err.message || 'The tutor could not respond. Please try again.')
      if (phase === 'new_problem') setProblemPending(false)
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
      <Confetti active={celebrating} />

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

      {/* ── Hero progress bar + neighborhood ranking ── */}
      <HeroProgressBar
        cumulativeSeconds={cumulativeSeconds}
        problemsCompleted={problemsCompleted}
        problemComplete={problemComplete}
        neighborhood={neighborhood}
        rankTotal={rankTotal}
      />

      {/* Sticky, collapsible problem card */}
      <div className="sticky top-0 z-10 shrink-0 bg-paper border-b border-line">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className={`card overflow-hidden transition-colors ${problemComplete ? 'border-emerald-400' : ''}`}>
            <button
              type="button"
              onClick={() => setProblemOpen((o) => !o)}
              aria-expanded={problemOpen}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                {problemComplete && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span className="eyebrow">{problemComplete ? 'Solved!' : 'Problem'}</span>
              </div>
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
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
                {problemComplete && (
                  <p className="mt-2 text-xs font-medium text-emerald-600">
                    Great work! Type your next problem below to continue.
                  </p>
                )}
              </div>
            ) : (
              <p className="px-4 pb-3 -mt-1 text-sm text-muted truncate">
                <MathText text={getProblemText({ problem, problemPending })} />
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Hint countdown strip — visible only during an active problem */}
      {problem && !problemComplete && (
        <HintCountdown
          nextHintAt={nextHintAt}
          hintAllowed={hintAllowed}
          hintsExhausted={hintsExhausted}
        />
      )}

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
          {messages.map((m, i) => (
            <Message key={i} role={m.role} text={m.text} />
          ))}
          {((!problem && !problemPending) || problemComplete) && !reflectionPending && !sending && (
            <TopicPicker
              bands={topicBands}
              activeTopic={activeTopic}
              suggestions={suggestions}
              loading={suggestLoading}
              onTopic={chooseTopic}
              onProblem={startSuggested}
              onRefresh={() => chooseTopic(activeTopic)}
              onBack={() => { setActiveTopic(null); setSuggestions(null) }}
            />
          )}
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
            onChange={(e) => { setInput(e.target.value); autoGrow() }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={
              problemComplete
                ? 'Enter your next problem…'
                : problem
                ? 'Enter your question'
                : 'Enter a math problem to get started…'
            }
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

// ─── Hero Progress Bar ────────────────────────────────────────────────────────

function HeroProgressBar({ cumulativeSeconds, problemsCompleted, problemComplete, neighborhood, rankTotal }) {
  const pct = Math.min(100, (cumulativeSeconds / GOAL_SECONDS) * 100)
  const timeLabel = formatEngagedTime(cumulativeSeconds)
  const done = cumulativeSeconds >= GOAL_SECONDS

  return (
    <div className="shrink-0 bg-surface border-b border-line">
      <div className="max-w-2xl mx-auto px-4 py-2 flex gap-4">

        {/* Left half: compact time bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between mb-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-medium text-ink tabular-nums">{timeLabel}</span>
              <span className="text-[10px] text-muted">/ 10h</span>
            </div>
            <div
              className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${problemComplete ? 'text-emerald-600' : 'text-muted'}`}
              aria-live="polite"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{problemsCompleted} solved</span>
            </div>
          </div>

          <div
            className="relative h-1.5 rounded-full overflow-hidden bg-faint"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${timeLabel} of 10 hours completed`}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: done
                  ? 'linear-gradient(90deg, #10b981, #059669)'
                  : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              }}
            />
          </div>

          <div className="flex justify-between mt-1">
            {MILESTONES_H.map((h) => {
              const reached = cumulativeSeconds >= h * 3600
              const isGoal = h === 10
              return (
                <span
                  key={h}
                  className={`text-[9px] font-medium transition-colors ${
                    reached ? (isGoal ? 'text-emerald-600' : 'text-primary') : 'text-faint'
                  }`}
                >
                  {isGoal ? '10h 🎓' : reached ? `${h}h ✓` : `${h}h`}
                </span>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-line self-stretch" aria-hidden="true" />

        {/* Right half: neighborhood ranking */}
        <div className="flex-1 min-w-0">
          <NeighborhoodPanel neighborhood={neighborhood} rankTotal={rankTotal} />
        </div>
      </div>
    </div>
  )
}

// ─── Neighborhood Ranking Panel ───────────────────────────────────────────────

function NeighborhoodPanel({ neighborhood, rankTotal }) {
  const myEntry = neighborhood.find((r) => r.isMe)

  return (
    <div>
      {/* Header: "Rank 10 of 47 · by study time" */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-ink">
          {myEntry ? `Rank ${myEntry.rank} of ${rankTotal}` : 'Your rank'}
        </span>
        <span className="text-[9px] text-faint">by study time</span>
      </div>

      {neighborhood.length === 0 ? (
        <p className="text-xs text-faint">Loading…</p>
      ) : (
        <div className="flex flex-col" style={{ gap: '2px' }}>
          {neighborhood.map((row) => (
            <div
              key={row.rank}
              className="flex items-center gap-2 rounded"
              style={
                row.isMe
                  ? { background: '#eff6ff', padding: '2px 4px', margin: '0 -4px' }
                  : { padding: '2px 4px', margin: '0 -4px' }
              }
            >
              {/* Rank number */}
              <span
                style={{
                  fontSize: row.isMe ? '13px' : '11px',
                  fontWeight: row.isMe ? 700 : 400,
                  color: row.isMe ? '#2563eb' : '#bbb',
                  width: '18px',
                  textAlign: 'right',
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                {row.rank}
              </span>

              {/* Name */}
              <span
                className="flex-1 truncate"
                style={{
                  fontSize: row.isMe ? '13px' : '11px',
                  fontWeight: row.isMe ? 700 : 400,
                  color: row.isMe ? '#111' : '#888',
                  lineHeight: 1,
                }}
              >
                {row.isMe ? 'You ✦' : `P-${row.slotId}`}
              </span>

              {/* Time */}
              <span
                className="tabular-nums shrink-0"
                style={{
                  fontSize: row.isMe ? '13px' : '11px',
                  fontWeight: row.isMe ? 700 : 400,
                  color: row.isMe ? '#2563eb' : '#aaa',
                  lineHeight: 1,
                }}
              >
                {formatEngagedTime(row.seconds)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Topic Picker ────────────────────────────────────────────────────────────

const LEVEL_STYLES = {
  easy: { label: 'Easy', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  medium: { label: 'Medium', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  challenge: { label: 'Challenge', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
}

function TopicPicker({ bands, activeTopic, suggestions, loading, onTopic, onProblem, onRefresh, onBack }) {
  if (!bands.length) return null

  // Screen 2: a topic is chosen — show the 3 suggested problems
  if (activeTopic) {
    return (
      <div className="card px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-ink">
            {activeTopic.icon} {activeTopic.label}
          </p>
          <button type="button" onClick={onBack} className="text-xs font-medium text-muted hover:text-ink transition-colors">
            ← Topics
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted py-3">Finding good problems for you…</p>
        ) : suggestions ? (
          <>
            <p className="text-xs text-muted mb-2">Pick one to start:</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s, i) => {
                const st = LEVEL_STYLES[s.level] || LEVEL_STYLES.medium
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onProblem(s.text)}
                    className="text-left rounded-xl px-3.5 py-2.5 transition-transform hover:scale-[1.01] active:scale-[0.99]"
                    style={{ background: st.bg, border: `1px solid ${st.border}` }}
                  >
                    <span className="block text-[11px] font-semibold mb-0.5" style={{ color: st.color }}>
                      {st.label}
                    </span>
                    <span className="block text-sm text-ink leading-snug">
                      <MathText text={s.text} />
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="text-center mt-3">
              <button type="button" onClick={onRefresh} className="text-xs font-medium text-primary hover:underline">
                ↻ Show 3 different ones
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted py-3">
            Couldn't load problems for this topic. Try another topic, or type your own problem below.
          </p>
        )}
      </div>
    )
  }

  // Screen 1: topic tiles (grouped by grade band when grade is unknown)
  return (
    <div className="card px-4 py-4">
      <p className="text-sm font-medium text-ink mb-0.5">What do you want to practice today?</p>
      <p className="text-xs text-muted mb-3">Pick a topic — I'll give you a problem. Or type your own below.</p>

      {bands.map((b) => (
        <div key={b.band} className="mb-3 last:mb-0">
          {bands.length > 1 && (
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5">{b.label}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {b.topics.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTopic({ ...t, band: b.band })}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:border-primary hover:text-primary transition-colors"
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Hint Countdown Strip ────────────────────────────────────────────────────

function HintCountdown({ nextHintAt, hintAllowed, hintsExhausted }) {
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (hintAllowed || hintsExhausted || !nextHintAt) {
      setSecondsLeft(0)
      return
    }
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((new Date(nextHintAt) - Date.now()) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [nextHintAt, hintAllowed, hintsExhausted])

  // Nothing to show until we've had at least one API response with hint info
  if (!hintAllowed && !nextHintAt && !hintsExhausted) return null

  if (hintsExhausted) {
    return (
      <div className="shrink-0 border-b border-line bg-paper">
        <div className="max-w-2xl mx-auto px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] text-faint">No more hints for this problem — keep working, you're close!</span>
        </div>
      </div>
    )
  }

  if (hintAllowed) {
    return (
      <div className="shrink-0 border-b border-line" style={{ background: '#f0fdf4' }}>
        <div className="max-w-2xl mx-auto px-4 py-1.5 flex items-center gap-2">
          <span className="text-sm">💡</span>
          <span className="text-[11px] font-medium" style={{ color: '#15803d' }}>
            Hint ready — type <strong>hint</strong> to get one
          </span>
        </div>
      </div>
    )
  }

  if (!secondsLeft) return null

  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  const timeStr = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`

  // Progress ring: fill proportional to how far through the delay we are.
  // We don't know total delay here, so use a simple pulsing dot instead.
  return (
    <div className="shrink-0 border-b border-line bg-paper">
      <div className="max-w-2xl mx-auto px-4 py-1.5 flex items-center gap-2">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: '#f59e0b', animation: 'hint-pulse 1s ease-in-out infinite' }}
          aria-hidden="true"
        />
        <style>{`@keyframes hint-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
        <span className="text-[11px] text-muted">
          Next hint available in{' '}
          <span className="font-semibold text-ink tabular-nums">{timeStr}</span>
          {' '}— keep working on the problem!
        </span>
      </div>
    </div>
  )
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function Confetti({ active }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: (5 + (i * 2.5 + Math.random() * 8) % 90).toFixed(1),
        color: ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'][i % 6],
        delay: ((i % 6) * 0.1 + Math.random() * 0.3).toFixed(2),
        duration: (0.9 + Math.random() * 0.9).toFixed(2),
        size: Math.round(6 + Math.random() * 8),
        round: i % 3 !== 0,
      })),
    []
  )

  if (!active) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(105vh) rotate(600deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.round ? '50%' : '2px',
            animation: `confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEngagedTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0 && m === 0) return '0m'
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
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
  return 'Enter a math problem below to get started.'
}

// ─── UI components ───────────────────────────────────────────────────────────

function Message({ role, text }) {
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

function Dot({ delay }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-faint animate-bounce"
      style={{ animationDelay: delay }}
    />
  )
}
