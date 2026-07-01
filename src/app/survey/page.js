'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SURVEY_QUESTIONS } from '@/lib/surveyQuestions'

const SESSION_KEY = 'study_session_id'

function getSessionId() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_KEY)
}

export default function SurveyPage() {
  const [answers, setAnswers] = useState({})
  const [step, setStep] = useState(0)
  const [isMobile, setIsMobile] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function setAnswer(id, value) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  function allAnswered() {
    return SURVEY_QUESTIONS.every((q) => {
      const v = answers[q.id]
      return v !== undefined && v !== null && String(v).trim() !== ''
    })
  }

  async function handleSubmit() {
    if (!allAnswered()) {
      setError('Please answer every question before continuing.')
      return
    }
    setError('')
    setSubmitting(true)

    const sessionId = getSessionId()
    if (!sessionId) {
      setError('Your session expired. Please start again from the consent form.')
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/save-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, responses: answers }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Could not save your answers. Please try again.')
        setSubmitting(false)
        return
      }

      router.push('/video')
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (isMobile) {
    return (
      <MobileSurvey
        answers={answers}
        setAnswer={setAnswer}
        step={step}
        setStep={setStep}
        error={error}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    )
  }

  return (
    <DesktopSurvey
      answers={answers}
      setAnswer={setAnswer}
      error={error}
      submitting={submitting}
      onSubmit={handleSubmit}
    />
  )
}

// ---------- Mobile: one question per screen ----------
function MobileSurvey({ answers, setAnswer, step, setStep, error, submitting, onSubmit }) {
  const total = SURVEY_QUESTIONS.length
  const q = SURVEY_QUESTIONS[step]
  const isLast = step === total - 1
  const currentValue = answers[q.id]
  const hasAnswer = currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== ''

  function goNext() {
    if (isLast) {
      onSubmit()
    } else {
      setStep((s) => Math.min(total - 1, s + 1))
    }
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1))
  }

  function selectAndAdvance(value) {
    setAnswer(q.id, value)
    if (!isLast) {
      setTimeout(() => setStep((s) => s + 1), 150)
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-paper">
      <div className="shrink-0 px-4 pt-5">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="eyebrow">Step 2 of 3 · Survey</p>
            <p className="text-xs font-medium text-muted">
              {step + 1} / {total}
            </p>
          </div>
          <div className="h-1.5 bg-line rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${((step + 1) / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-8 pb-4 overflow-y-auto">
        <div className="max-w-md mx-auto">
          <p className="font-serif text-xl text-ink leading-snug mb-6">{q.label}</p>
          <QuestionInput question={q} value={currentValue} onChange={(v) => setAnswer(q.id, v)} onSelect={selectAndAdvance} />
        </div>
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-line bg-surface">
        <div className="max-w-md mx-auto">
          {error && <p className="text-sm text-danger mb-2">{error}</p>}
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={goBack} className="btn btn-outline px-5 h-12">
                Back
              </button>
            )}
            <button
              onClick={goNext}
              disabled={!hasAnswer || submitting}
              className="btn btn-primary flex-1 h-12"
            >
              {submitting ? 'Submitting…' : isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Desktop: all questions on one page ----------
function DesktopSurvey({ answers, setAnswer, error, submitting, onSubmit }) {
  return (
    <div className="min-h-screen bg-paper py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <p className="eyebrow">Step 2 of 3 · Survey</p>
        <h1 className="font-serif text-2xl text-ink mt-1.5 mb-1">Before you begin</h1>
        <p className="text-sm text-muted mb-8">
          Please answer all {SURVEY_QUESTIONS.length} questions below.
        </p>

        <div className="card divide-y divide-line">
          {SURVEY_QUESTIONS.map((q, i) => (
            <div key={q.id} className="p-6">
              <p className="text-sm font-semibold text-ink mb-4">
                <span className="text-faint mr-2">{i + 1}.</span>
                {q.label}
              </p>
              <QuestionInput
                question={q}
                value={answers[q.id]}
                onChange={(v) => setAnswer(q.id, v)}
              />
            </div>
          ))}
        </div>

        <div className="mt-6">
          {error && <p className="text-sm text-danger mb-3">{error}</p>}
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="btn btn-primary px-7 h-12"
          >
            {submitting ? 'Submitting…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Shared input renderer ----------
function QuestionInput({ question, value, onChange, onSelect }) {
  const handlePick = (v) => {
    onChange(v)
    if (onSelect) onSelect(v)
  }

  if (question.type === 'select') {
    return (
      <div className="flex flex-col gap-2">
        {question.options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => handlePick(opt)}
            className={`choice ${value === opt ? 'choice-selected' : ''}`}
          >
            {opt}
          </button>
        ))}
      </div>
    )
  }

  if (question.type === 'scale') {
    const nums = []
    for (let i = question.min; i <= question.max; i++) nums.push(i)
    const wrap = nums.length > 5
    return (
      <div>
        <div className={wrap ? 'grid grid-cols-4 gap-2 mb-2' : 'flex gap-2 mb-2'}>
          {nums.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handlePick(n)}
              className={`choice h-12 flex items-center justify-center font-semibold ${
                !wrap ? 'flex-1 px-0' : 'px-0'
              } ${value === n ? 'choice-selected' : ''}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>{question.minLabel}</span>
          <span>{question.maxLabel}</span>
        </div>
      </div>
    )
  }

  if (question.type === 'number') {
    return (
      <input
        type="number"
        inputMode="numeric"
        min={question.min}
        max={question.max}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
    )
  }

  // text
  return (
    <input
      type="text"
      placeholder={question.placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="field"
    />
  )
}
