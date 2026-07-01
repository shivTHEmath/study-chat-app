'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { content } from '@/lib/consentContent'

const SCROLL_THRESHOLD = 0.95
const SESSION_KEY = 'study_session_id'
const LANG_KEY = 'consent_lang'
const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'mr', label: 'मराठी' },
]

function getOrCreateSessionId() {
  if (typeof window === 'undefined') return null
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export default function ConsentPage() {
  const [lang, setLangState] = useState('en')
  const [scrollPct, setScrollPct] = useState(0)
  const [unlocked, setUnlocked] = useState(false)

  const [parentName, setParentName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [childName, setChildName] = useState('')
  const [parentSignature, setParentSignature] = useState('')

  const [studentAssent, setStudentAssent] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [studentSignature, setStudentSignature] = useState('')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const router = useRouter()
  const scrollRef = useRef(null)
  const today = new Date().toLocaleDateString()

  // Load saved language preference on mount
  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved && content[saved]) setLangState(saved)
  }, [])

  function setLang(code) {
    setLangState(code)
    localStorage.setItem(LANG_KEY, code)
  }

  // Reset scroll and re-check auto-unlock whenever language changes
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = 0
    setScrollPct(0)
    setUnlocked(false)
    // Re-check if content is short enough to not require scrolling
    if (el.scrollHeight <= el.clientHeight + 4) {
      setScrollPct(1)
      setUnlocked(true)
    }
  }, [lang])

  // Initial auto-unlock check (large screens where content fits without scrolling)
  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollHeight <= el.clientHeight + 4) {
      setScrollPct(1)
      setUnlocked(true)
    }
  }, [])

  const handleScroll = useCallback((e) => {
    const el = e.target
    const max = el.scrollHeight - el.clientHeight
    const pct = max > 0 ? el.scrollTop / max : 1
    setScrollPct(pct)
    if (pct >= SCROLL_THRESHOLD) setUnlocked(true)
  }, [])

  const filled = (v) => v.trim().length > 1

  // Content for the active language, falling back to English
  const c = content[lang] ?? content.en

  const canSubmit =
    unlocked &&
    filled(parentName) &&
    filled(relationship) &&
    filled(childName) &&
    filled(parentSignature) &&
    studentAssent !== null &&
    (studentAssent === 'no' || (filled(studentName) && filled(studentSignature)))

  async function handleSubmit() {
    if (!canSubmit) return
    setError('')
    setSubmitting(true)

    try {
      const sessionId = getOrCreateSessionId()

      const res = await fetch('/api/save-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          consentGiven: studentAssent === 'yes',
          parentName,
          relationship,
          childName,
          parentSignature,
          studentName: studentAssent === 'yes' ? studentName : null,
          studentSignature: studentAssent === 'yes' ? studentSignature : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || c.errors.saveError)
        setSubmitting(false)
        return
      }

      if (studentAssent === 'no') {
        router.push('/consent/declined')
        return
      }

      router.push('/survey')
    } catch {
      setError(c.errors.genericError)
      setSubmitting(false)
    }
  }

  const pf = c.parentForm
  const sf = c.studentForm

  return (
    <div className="h-[100dvh] flex flex-col bg-paper">
      {/* Sticky header */}
      <header className="shrink-0 px-4 py-3.5 border-b border-line bg-surface">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">{c.header.eyebrow}</p>
              <h1 className="font-serif text-lg text-ink mt-1">{c.header.title}</h1>
              <p className="text-xs text-muted mt-0.5">{c.header.subtitle}</p>
            </div>
            <Link
              href="/login"
              className="text-xs text-primary underline underline-offset-2 shrink-0 pt-0.5"
            >
              {c.header.loginLink}
            </Link>
          </div>

          {/* Language switcher */}
          <div className="flex gap-1.5 mt-2.5">
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  lang === code
                    ? 'bg-primary text-white'
                    : 'bg-line text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-6 text-sm"
      >
        <div className="max-w-2xl mx-auto">
          <p className="font-serif text-base text-ink leading-snug mb-4">{c.studyTitle}</p>
          <p className="text-xs text-muted mb-1">{c.pi}</p>
          <p className="text-xs text-muted mb-6">{c.contact}</p>

          {c.sections.map((section) => (
            <Section key={section.title} title={section.title}>
              {section.body}
            </Section>
          ))}

          {/* Parental / guardian permission */}
          <div className="card p-5 mt-7">
            <p className="font-serif text-base text-ink mb-2">{pf.title}</p>
            <p className="text-xs text-muted mb-4 leading-relaxed">{pf.description}</p>

            <label className="label">{pf.parentName.label}</label>
            <input
              type="text"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder={pf.parentName.placeholder}
              className="field mb-3"
            />

            <label className="label">{pf.relationship.label}</label>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder={pf.relationship.placeholder}
              className="field mb-3"
            />

            <label className="label">{pf.childName.label}</label>
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder={pf.childName.placeholder}
              className="field mb-3"
            />

            <label className="label">{pf.parentSignature.label}</label>
            <input
              type="text"
              value={parentSignature}
              onChange={(e) => setParentSignature(e.target.value)}
              placeholder={pf.parentSignature.placeholder}
              className="field mb-3"
            />

            <p className="text-xs text-faint">{pf.dateLabel} {today}</p>
            <p className="text-xs text-faint mt-4 leading-relaxed">{pf.footnote}</p>
          </div>

          {/* Student assent form */}
          <div className="card p-5 mt-4 mb-2">
            <p className="font-serif text-base text-ink mb-2">{sf.title}</p>
            <p className="text-sm text-muted leading-relaxed mb-3">{sf.description}</p>
            <p className="text-sm text-muted leading-relaxed mb-2">{sf.studyInvolves}</p>
            <ul className="list-disc pl-5 text-sm text-muted leading-relaxed mb-3 space-y-1.5">
              {sf.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <p className="text-sm text-muted leading-relaxed mb-3">{sf.voluntaryNote}</p>
            <p className="text-sm text-muted leading-relaxed mb-4">{sf.privacyNote}</p>

            <p className="text-sm text-ink font-medium mb-3">{sf.question}</p>
            <div className="flex flex-col gap-2 mb-4">
              <button
                type="button"
                onClick={() => setStudentAssent('yes')}
                className={`choice ${studentAssent === 'yes' ? 'choice-selected' : ''}`}
              >
                {sf.yesButton}
              </button>
              <button
                type="button"
                onClick={() => setStudentAssent('no')}
                className={`choice ${studentAssent === 'no' ? 'choice-selected' : ''}`}
              >
                {sf.noButton}
              </button>
            </div>

            {studentAssent === 'yes' && (
              <>
                <label className="label">{sf.studentName.label}</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder={sf.studentName.placeholder}
                  className="field mb-3"
                />

                <label className="label">{sf.signature.label}</label>
                <input
                  type="text"
                  value={studentSignature}
                  onChange={(e) => setStudentSignature(e.target.value)}
                  placeholder={sf.signature.placeholder}
                  className="field mb-3"
                />

                <p className="text-xs text-faint">{sf.dateLabel} {today}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 px-4 py-3 border-t border-line bg-surface">
        <div className="max-w-2xl mx-auto">
          <div className="h-1.5 bg-line rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(100, Math.round(scrollPct * 100))}%` }}
            />
          </div>

          {error && <p className="text-sm text-danger mb-2">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="btn btn-primary w-full h-12"
          >
            {submitting
              ? c.footer.submitting
              : !unlocked
              ? c.footer.scrollPrompt
              : c.footer.submit}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <p className="font-serif text-base text-ink mb-1">{title}</p>
      <p className="text-sm text-muted leading-relaxed">{children}</p>
    </div>
  )
}
