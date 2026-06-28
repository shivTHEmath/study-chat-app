'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const SCROLL_THRESHOLD = 0.95 // must scroll to 95% of content height to unlock submit
const SESSION_KEY = 'study_session_id'

// Generates (or reuses) a temporary id that ties together consent -> survey -> signup,
// before any real account exists. Stored in sessionStorage only (cleared if the
// browser tab closes before signup completes, which is the safe default for a minor's
// pre-account flow).
function getOrCreateSessionId() {
  if (typeof window === 'undefined') return null
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export default function ConsentPage() {
  const [scrollPct, setScrollPct] = useState(0)
  const [unlocked, setUnlocked] = useState(false)

  const [parentName, setParentName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [studentAssent, setStudentAssent] = useState(null) // 'yes' | 'no' | null
  const [studentName, setStudentName] = useState('')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const router = useRouter()
  const today = new Date().toLocaleDateString()

  const handleScroll = useCallback((e) => {
    const el = e.target
    const max = el.scrollHeight - el.clientHeight
    const pct = max > 0 ? el.scrollTop / max : 1
    setScrollPct(pct)
    if (pct >= SCROLL_THRESHOLD) setUnlocked(true)
  }, [])

  const canSubmit =
    unlocked &&
    parentName.trim().length > 1 &&
    relationship.trim().length > 1 &&
    studentAssent !== null &&
    (studentAssent === 'no' || studentName.trim().length > 1)

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
          studentName: studentAssent === 'yes' ? studentName : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Could not save your response. Please try again.')
        setSubmitting(false)
        return
      }

      if (studentAssent === 'no') {
        router.push('/consent/declined')
        return
      }

      router.push('/survey')
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-paper">
      {/* Sticky header */}
      <header className="shrink-0 px-4 py-3.5 border-b border-line bg-surface">
        <div className="max-w-2xl mx-auto">
          <p className="eyebrow">Step 1 of 3 · Informed consent</p>
          <h1 className="font-serif text-lg text-ink mt-1">
            Parent consent &amp; student assent
          </h1>
          <p className="text-xs text-muted mt-0.5">Please scroll to read the full form.</p>
        </div>
      </header>

      {/* Scrollable body */}
      <div onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6 text-sm">
        <div className="max-w-2xl mx-auto">
        <p className="font-serif text-base text-ink leading-snug mb-4">
          The Effect of AI Tutor Design Parameters on Independent Reasoning Capacity in
          Middle School Students
        </p>
        <p className="text-xs text-muted mb-1">
          Principal Investigator: Shivsai Sharda — Non-Trivial Research Fellowship
        </p>
        <p className="text-xs text-muted mb-6">
          Contact: shivsai1811@gmail.com · (408) 872-2032
        </p>

        <Section title="General information and purpose">
          Your child is being invited to partake in a research study. Please review this
          form carefully to understand the potential consequences from participation. The
          purpose of this research study is to determine how different settings of an AI
          tutoring system could affect students&apos; abilities to reason independently. We
          adjust parameters such as the specificity of hints given by the AI, the length of
          time between responses, and other similar factors. By collecting data from
          several participants, we can design AI tutoring systems in a way that benefits
          students the most.
        </Section>

        <Section title="Procedure">
          At the beginning of the study, students will complete a survey measuring existing
          knowledge and access to help, taking about ten minutes. Over the following three
          weeks, participants will interact with an AI tutoring system for at least ten
          hours total, for assistance with, learning, or revising mathematics topics. At
          the end of some sessions, students may be given assessments of about twenty
          minutes to measure the effects on independent reasoning. Your child will receive
          one version of the tutoring tool based on a randomized process. About 100
          students total will take part in the study.
        </Section>

        <Section title="Risks">
          This study involves minimal risk. Some participants may receive a tutoring
          system we expect to be slightly less effective than others, though the effects
          will be comparable to standard classroom-based instruction. The tutoring system
          is designed to avoid handing out direct answers, instead using questioning and
          hints to support independent thinking.
        </Section>

        <Section title="Benefits">
          Your child may benefit from the explanations, hints, and additional mathematics
          practice provided. There is no guarantee of direct benefit from participating.
        </Section>

        <Section title="Compensation, costs, and reimbursements">
          Your child will not receive monetary payment for taking part. There are no costs
          to you or your child for participation.
        </Section>

        <Section title="Withdrawal or termination">
          Your child may withdraw at any time without negative consequences and without
          needing to give a reason. To withdraw, contact Shivsai Sharda at
          shivsai1811@gmail.com or (408) 872-2032. Your child may also be removed from the
          study for malicious use of the tutoring system, violation of this form&apos;s
          terms, or if the study ends early for any reason. You will be notified promptly
          if this occurs.
        </Section>

        <Section title="Confidentiality">
          Data collected will remain private to the principal investigator. Participant
          names will not be collected; participants are identified by username only.
          Personally identifying or sensitive information (such as ID numbers or financial
          information) will not be collected. Data collected includes message history with
          the tutoring system, self-reported prior knowledge, gender and grade, and survey
          and assessment results. All data is stored on a password-protected database
          (Supabase) accessible only to the principal investigator. Most data will be
          securely deleted by September 2026; survey and assessment results may be kept
          until the end of 2027 for future research. This study complies with the Digital
          Personal Data Protection Act, 2023 (India). Data will not be sold or shared
          outside this research. Only anonymized findings will be published, and data can
          be deleted immediately upon request.
        </Section>

        <Section title="Alternatives to participation">
          Participation is entirely voluntary, and there are no required alternatives.
        </Section>

        <Section title="Other considerations">
          The researcher has no financial interest or stake in the outcomes of this
          research. It is conducted solely for public benefit.
        </Section>

        <Section title="Contact information">
          Shivsai Sharda, Non-Trivial Research Fellowship. Email: shivsai1811@gmail.com.
          Phone: (408) 872-2032.
        </Section>

        {/* Parent permission block */}
        <div className="card p-5 mt-7">
          <p className="font-serif text-base text-ink mb-2">Parent or guardian permission</p>
          <p className="text-xs text-muted mb-4 leading-relaxed">
            By entering your name below, you confirm that you have read this form and
            voluntarily give permission for your child to participate, understanding that
            your child can withdraw at any time.
          </p>
          <label className="label">Full name</label>
          <input
            type="text"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="Parent or guardian name"
            className="field mb-3"
          />
          <label className="label">Relationship to child</label>
          <input
            type="text"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="e.g. Mother, Father, Guardian"
            className="field mb-3"
          />
          <p className="text-xs text-faint">Date: {today}</p>
        </div>

        {/* Student assent block */}
        <div className="card p-5 mt-4 mb-2">
          <p className="font-serif text-base text-ink mb-2">Student assent</p>
          <p className="text-xs text-muted mb-4 leading-relaxed">
            Participating in this study is your choice entirely. You may opt out at any
            time, without consequences. Your answers and activity will remain private to
            the principal investigator, and your name will never be published.
          </p>
          <p className="text-sm text-ink font-medium mb-3">
            Do you agree to take part in this study?
          </p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setStudentAssent('yes')}
              className={`choice flex-1 text-center ${
                studentAssent === 'yes' ? 'choice-selected' : ''
              }`}
            >
              Yes, I agree
            </button>
            <button
              type="button"
              onClick={() => setStudentAssent('no')}
              className={`choice flex-1 text-center ${
                studentAssent === 'no' ? 'choice-selected' : ''
              }`}
            >
              No
            </button>
          </div>
          {studentAssent === 'yes' && (
            <>
              <label className="label">Student name</label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Student full name"
                className="field mb-2"
              />
            </>
          )}
          <p className="text-xs text-faint">Date: {today}</p>
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
              ? 'Submitting…'
              : !unlocked
              ? 'Scroll to read the full form'
              : 'Submit consent and assent'}
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
