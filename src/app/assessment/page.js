'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MathText from '@/components/MathText'

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '--'
  return `${Math.round(Number(value) * 100)}%`
}

function formatTimeLeft(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function AssessmentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [assessment, setAssessment] = useState(null)
  const [answers, setAnswers] = useState({})
  const [confidences, setConfidences] = useState({})
  const [result, setResult] = useState(null)
  const [now, setNow] = useState(null)

  async function startAssessment() {
    setStarting(true)
    setError('')

    const res = await fetch('/api/assessments/start', { method: 'POST' })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Could not start the assessment.')
      setStarting(false)
      return
    }

    setAssessment(data.assessment)
    setStarting(false)
  }

  useEffect(() => {
    async function loadStatus() {
      setError('')
      setLoading(true)

      const res = await fetch('/api/assessments/status')
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Could not load assessment status.')
        setLoading(false)
        return
      }

      if (!data.assessmentAvailable) {
        setError(
          data.blockedByActiveProblem
            ? 'Finish your current problem first. The assessment will wait.'
            : 'No assessment is available yet.'
        )
        setLoading(false)
        return
      }

      if (data.assessment?.status === 'in_progress') {
        setAssessment(data.assessment)
      } else {
        await startAssessment()
      }

      setLoading(false)
    }

    loadStatus()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  function updateAnswer(itemId, value) {
    setAnswers((current) => ({ ...current, [itemId]: value }))
  }

  function updateConfidence(itemId, value) {
    setConfidences((current) => ({ ...current, [itemId]: Number(value) }))
  }

  async function submitAssessment(e) {
    e.preventDefault()
    if (!assessment) return

    setSubmitting(true)
    setError('')

    const responses = assessment.items.map((item) => ({
      itemId: item.id,
      answer: answers[item.id] || '',
      confidence: confidences[item.id] ?? 50,
    }))

    const res = await fetch('/api/assessments/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId: assessment.id, responses }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Could not submit the assessment.')
      setSubmitting(false)
      return
    }

    setResult(data)
    setSubmitting(false)
  }

  const timeLeftMs =
    assessment?.dueAt && now !== null
      ? new Date(assessment.dueAt).getTime() - now
      : null

  const answeredCount = assessment?.items?.filter((item) => answers[item.id]?.trim()).length || 0
  const allAnswered = assessment?.items?.length > 0 && answeredCount === assessment.items.length

  if (loading || starting) {
    return (
      <main className="min-h-screen bg-paper px-4 py-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-muted">Loading assessment...</p>
        </div>
      </main>
    )
  }

  if (result) {
    return (
      <main className="min-h-screen bg-paper px-4 py-8">
        <section className="card mx-auto max-w-3xl p-6">
          <h1 className="text-2xl font-semibold text-ink">Assessment submitted</h1>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-line p-4">
              <p className="eyebrow">Score</p>
              <p className="mt-2 text-2xl font-semibold">{formatPercent(result.score)}</p>
            </div>
            <div className="rounded-md border border-line p-4">
              <p className="eyebrow">Mean confidence</p>
              <p className="mt-2 text-2xl font-semibold">{formatPercent(result.meanConfidence)}</p>
            </div>
            <div className="rounded-md border border-line p-4">
              <p className="eyebrow">Calibration error</p>
              <p className="mt-2 text-2xl font-semibold">{formatPercent(result.calibrationError)}</p>
            </div>
          </div>
          {result.submittedLate && (
            <p className="mt-4 text-sm text-danger">This was submitted after the 30-minute window.</p>
          )}
          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="btn btn-primary mt-6 h-10 px-4"
          >
            Back to chat
          </button>
        </section>
      </main>
    )
  }

  if (error && !assessment) {
    return (
      <main className="min-h-screen bg-paper px-4 py-8">
        <section className="card mx-auto max-w-3xl p-6">
          <h1 className="text-xl font-semibold text-ink">Assessment</h1>
          <p className="mt-3 text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="btn btn-primary mt-6 h-10 px-4"
          >
            Back to chat
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8">
      <form onSubmit={submitAssessment} className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">30 minutes</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">Assessment</h1>
            <p className="mt-1 text-sm text-muted">
              {answeredCount} of {assessment.items.length} answered
            </p>
          </div>
          <div className="rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium tabular-nums text-ink">
            {timeLeftMs !== null ? formatTimeLeft(timeLeftMs) : '30:00'}
          </div>
        </header>

        <div className="space-y-4">
          {assessment.items.map((item) => (
            <section key={item.id} className="card p-5">
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-white">
                  {item.position}
                </span>
                <p className="pt-1 text-base leading-7 text-ink">
                  <MathText text={item.prompt} />
                </p>
              </div>

              <label className="label mt-4" htmlFor={`answer-${item.id}`}>
                Answer
              </label>
              <textarea
                id={`answer-${item.id}`}
                value={answers[item.id] || ''}
                onChange={(e) => updateAnswer(item.id, e.target.value)}
                rows={3}
                className="field"
              />

              <label className="label mt-4" htmlFor={`confidence-${item.id}`}>
                Confidence: {confidences[item.id] ?? 50}%
              </label>
              <input
                id={`confidence-${item.id}`}
                type="range"
                min="0"
                max="100"
                step="5"
                value={confidences[item.id] ?? 50}
                onChange={(e) => updateConfidence(item.id, e.target.value)}
                className="mt-2 w-full accent-primary"
              />
            </section>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <div className="sticky bottom-0 mt-6 border-t border-line bg-paper py-4">
          <button
            type="submit"
            disabled={submitting || !allAnswered}
            className="btn btn-primary h-11 w-full px-4 disabled:opacity-50 sm:w-auto"
          >
            {submitting ? 'Submitting...' : 'Submit assessment'}
          </button>
        </div>
      </form>
    </main>
  )
}
