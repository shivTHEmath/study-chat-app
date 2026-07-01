'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import MathText from '@/components/MathText'

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Math.round(Number(value) * 100)}%`
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// phases: 'loading' | 'intro' | 'active' | 'result' | 'unavailable'
export default function AssessmentPage() {
  const router = useRouter()
  const [phase, setPhase] = useState('loading')
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [assessment, setAssessment] = useState(null)
  const [answers, setAnswers] = useState({})
  const [confidences, setConfidences] = useState({})
  const [result, setResult] = useState(null)
  const [now, setNow] = useState(Date.now())

  const submittedRef = useRef(false)

  // Load availability on mount. Never starts the clock — only decides whether to
  // show the intro (fresh) or resume an already in-progress attempt.
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/assessments/status')
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Could not load the assessment.')
          setPhase('unavailable')
          return
        }
        if (data.assessment?.status === 'in_progress') {
          setAssessment(data.assessment)
          setPhase('active')
        } else if (data.assessmentAvailable) {
          setPhase('intro')
        } else {
          setPhase('unavailable')
        }
      } catch {
        setError('Could not load the assessment.')
        setPhase('unavailable')
      }
    }
    load()
  }, [])

  // Tick the wall clock once a second while the assessment is active.
  useEffect(() => {
    if (phase !== 'active') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase])

  async function begin() {
    setStarting(true)
    setError('')
    try {
      const res = await fetch('/api/assessments/start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not start the assessment.')
        setStarting(false)
        return
      }
      setAssessment(data.assessment)
      setNow(Date.now())
      setPhase('active')
    } catch {
      setError('Could not start the assessment.')
    } finally {
      setStarting(false)
    }
  }

  const submit = useCallback(
    async ({ auto = false } = {}) => {
      if (!assessment || submittedRef.current) return
      submittedRef.current = true
      setSubmitting(true)
      setError('')

      const responses = assessment.items.map((item) => ({
        itemId: item.id,
        answer: answers[item.id] || '',
        confidence: confidences[item.id] ?? 50,
      }))

      try {
        const res = await fetch('/api/assessments/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assessmentId: assessment.id, responses, allowPartial: auto }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Could not submit the assessment.')
          submittedRef.current = false
          setSubmitting(false)
          return
        }
        setResult(data)
        setPhase('result')
      } catch {
        setError('Could not submit the assessment.')
        submittedRef.current = false
      } finally {
        setSubmitting(false)
      }
    },
    [assessment, answers, confidences]
  )

  const timeLeftMs =
    assessment?.dueAt ? new Date(assessment.dueAt).getTime() - now : null

  // Auto-submit whatever is entered the moment the window closes.
  useEffect(() => {
    if (phase === 'active' && timeLeftMs !== null && timeLeftMs <= 0 && !submittedRef.current) {
      submit({ auto: true })
    }
  }, [phase, timeLeftMs, submit])

  const items = assessment?.items || []
  const answeredCount = items.filter((it) => (answers[it.id] || '').trim()).length
  const allAnswered = items.length > 0 && answeredCount === items.length
  const lowTime = timeLeftMs !== null && timeLeftMs <= 5 * 60 * 1000

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <Shell>
        <div className="card p-7 text-center">
          <p className="text-sm text-muted">Loading assessment…</p>
        </div>
      </Shell>
    )
  }

  // ── Unavailable ──────────────────────────────────────────────────────────────
  if (phase === 'unavailable') {
    return (
      <Shell>
        <div className="card p-7">
          <p className="eyebrow">Assessment</p>
          <h1 className="font-serif text-xl text-ink mt-1">Nothing to do right now</h1>
          <p className="mt-3 text-sm text-muted">
            {error || 'No assessment is available yet. Keep working with the tutor — one will appear here when it is due.'}
          </p>
          <button onClick={() => router.push('/chat')} className="btn btn-primary h-11 px-5 mt-6">
            Back to chat
          </button>
        </div>
      </Shell>
    )
  }

  // ── Intro / instructions (clock not yet started) ─────────────────────────────
  if (phase === 'intro') {
    return (
      <Shell>
        <div className="card p-7">
          <p className="eyebrow">Check-in assessment</p>
          <h1 className="font-serif text-2xl text-ink mt-1">Before you continue</h1>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            This short assessment checks how well the ideas you&apos;ve been practising
            transfer to new problems. Answer on your own — the tutor is not available during
            the assessment.
          </p>

          <ul className="mt-5 space-y-3">
            <Fact label="10 problems" detail="Built from the topics you've worked on." />
            <Fact label="30 minutes" detail="The timer starts when you press begin, and can't be paused." />
            <Fact label="Rate your confidence" detail="For each answer, say how sure you are from 0 to 100%." />
          </ul>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}

          <div className="mt-7 flex flex-col-reverse sm:flex-row gap-3">
            <button
              onClick={() => router.push('/chat')}
              className="btn h-11 px-5 border border-line-strong text-ink"
            >
              Not now
            </button>
            <button onClick={begin} disabled={starting} className="btn btn-primary h-11 px-5 flex-1">
              {starting ? 'Preparing your problems…' : 'Begin assessment'}
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  // ── Result ───────────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <Shell>
        <div className="card p-7">
          <p className="eyebrow">Complete</p>
          <h1 className="font-serif text-2xl text-ink mt-1">Assessment submitted</h1>
          <p className="mt-2 text-sm text-muted">Thanks — your responses have been recorded.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric label="Score" value={formatPercent(result.score)} />
            <Metric label="Mean confidence" value={formatPercent(result.meanConfidence)} />
            <Metric label="Calibration gap" value={formatPercent(result.calibrationError)} />
          </div>
          <p className="mt-3 text-xs text-faint leading-relaxed">
            The calibration gap is the average distance between how confident you felt and how
            you actually did. Lower is better — it means your sense of certainty matches reality.
          </p>

          {result.submittedLate && (
            <p className="mt-4 text-sm text-danger">
              Submitted after the 30-minute window closed.
            </p>
          )}

          <button onClick={() => router.push('/chat')} className="btn btn-primary h-11 px-5 mt-6">
            Back to chat
          </button>
        </div>
      </Shell>
    )
  }

  // ── Active assessment ────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] flex flex-col bg-paper">
      {/* Sticky status bar */}
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Assessment</p>
            <p className="text-xs text-muted">{answeredCount} of {items.length} answered</p>
          </div>
          <div
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold tabular-nums ${
              lowTime
                ? 'border-danger/40 bg-danger/5 text-danger'
                : 'border-line-strong bg-surface text-ink'
            }`}
          >
            {timeLeftMs !== null ? formatClock(timeLeftMs) : '30:00'}
          </div>
        </div>
        {/* progress bar */}
        <div className="h-1 bg-line">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${items.length ? (answeredCount / items.length) * 100 : 0}%` }}
          />
        </div>
      </header>

      {/* Problems */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {items.map((item) => {
            const answered = (answers[item.id] || '').trim().length > 0
            return (
              <section key={item.id} className="card p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      answered ? 'bg-primary text-white' : 'bg-line text-muted'
                    }`}
                  >
                    {item.position}
                  </span>
                  <p className="pt-0.5 text-[15px] leading-7 text-ink">
                    <MathText text={item.prompt} />
                  </p>
                </div>

                <label className="label mt-4" htmlFor={`a-${item.id}`}>Your answer</label>
                <textarea
                  id={`a-${item.id}`}
                  value={answers[item.id] || ''}
                  onChange={(e) => setAnswers((c) => ({ ...c, [item.id]: e.target.value }))}
                  rows={2}
                  placeholder="Show your reasoning and give the answer"
                  className="field resize-none"
                />

                <div className="mt-4 flex items-center justify-between">
                  <label className="label mb-0" htmlFor={`c-${item.id}`}>How sure are you?</label>
                  <span className="text-sm font-semibold text-primary tabular-nums">
                    {confidences[item.id] ?? 50}%
                  </span>
                </div>
                <input
                  id={`c-${item.id}`}
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={confidences[item.id] ?? 50}
                  onChange={(e) =>
                    setConfidences((c) => ({ ...c, [item.id]: Number(e.target.value) }))
                  }
                  className="mt-2 w-full accent-primary"
                />
              </section>
            )
          })}

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </div>

      {/* Sticky submit bar */}
      <div
        className="shrink-0 border-t border-line bg-surface"
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-xs text-muted">
            {allAnswered ? 'All problems answered.' : `${items.length - answeredCount} left to answer.`}
          </p>
          <button
            onClick={() => submit()}
            disabled={submitting || !allAnswered}
            className="btn btn-primary h-11 px-6 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Shell({ children }) {
  return (
    <main className="min-h-[100dvh] bg-paper px-4 py-10">
      <div className="mx-auto max-w-xl">{children}</div>
    </main>
  )
}

function Fact({ label, detail }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span className="text-sm text-ink">
        <span className="font-semibold">{label}.</span>{' '}
        <span className="text-muted">{detail}</span>
      </span>
    </li>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-md border border-line p-4 text-center">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-serif text-2xl text-ink tabular-nums">{value}</p>
    </div>
  )
}
