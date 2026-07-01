'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const SCROLL_THRESHOLD = 0.95 // must scroll to 95% of content height to unlock submit
const SESSION_KEY = 'study_session_id'

// Generates (or reuses) a temporary id that ties together consent -> survey -> signup,
// before any real account exists. Uses localStorage so the id survives tab/browser
// restarts — the session_id → user_id link in /api/signup still works if the student
// takes a break between completing consent and finishing signup.
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
  const [scrollPct, setScrollPct] = useState(0)
  const [unlocked, setUnlocked] = useState(false)

  const [parentName, setParentName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [childName, setChildName] = useState('')
  const [parentSignature, setParentSignature] = useState('')

  const [studentAssent, setStudentAssent] = useState(null) // 'yes' | 'no' | null
  const [studentName, setStudentName] = useState('')
  const [studentSignature, setStudentSignature] = useState('')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const router = useRouter()
  const scrollRef = useRef(null)
  const today = new Date().toLocaleDateString()

  const handleScroll = useCallback((e) => {
    const el = e.target
    const max = el.scrollHeight - el.clientHeight
    const pct = max > 0 ? el.scrollTop / max : 1
    setScrollPct(pct)
    if (pct >= SCROLL_THRESHOLD) setUnlocked(true)
  }, [])

  // Fallback: if the form is short enough that it doesn't actually scroll
  // (large screens), there's nothing to scroll through, so unlock immediately.
  useEffect(() => {
    const el = scrollRef.current
    if (el && el.scrollHeight <= el.clientHeight + 4) {
      setScrollPct(1)
      setUnlocked(true)
    }
  }, [])

  const filled = (v) => v.trim().length > 1

  const canSubmit =
    unlocked &&
    filled(parentName) &&
    filled(relationship) &&
    filled(childName) &&
    filled(parentSignature) &&
    studentAssent !== null &&
    (studentAssent === 'no' ||
      (filled(studentName) && filled(studentSignature)))

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
    <div className="h-[100dvh] flex flex-col bg-paper">
      {/* Sticky header */}
      <header className="shrink-0 px-4 py-3.5 border-b border-line bg-surface">
        <div className="max-w-2xl mx-auto flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Step 1 of 3 · Informed consent</p>
            <h1 className="font-serif text-lg text-ink mt-1">
              Parent consent &amp; student assent
            </h1>
            <p className="text-xs text-muted mt-0.5">Please scroll to read the full form.</p>
          </div>
          <Link
            href="/login"
            className="text-xs text-primary underline underline-offset-2 shrink-0 pt-0.5"
          >
            Returning participant? Log in
          </Link>
        </div>
      </header>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-6 text-sm"
      >
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

          <Section title="Voluntary participation">
            The decision to allow your child to participate, or not to participate, is
            entirely yours. Choosing not to participate will have no negative effect on your
            child. You may withdraw at any time.
          </Section>

          {/* Parental / guardian permission */}
          <div className="card p-5 mt-7">
            <p className="font-serif text-base text-ink mb-2">Parental / guardian permission</p>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              By signing below, you confirm that you have read this form and understand any
              consequences of having your child participate in the study. You voluntarily
              give permission for your child to participate in this study, and understand
              that your child can withdraw at any time.
            </p>

            <label className="label">Parent / guardian full name</label>
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

            <label className="label">Child name *</label>
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="Child's full name"
              className="field mb-3"
            />

            <label className="label">Parent / guardian signature</label>
            <input
              type="text"
              value={parentSignature}
              onChange={(e) => setParentSignature(e.target.value)}
              placeholder="Type your full name to sign"
              className="field mb-3"
            />

            <p className="text-xs text-faint">Date: {today}</p>

            <p className="text-xs text-faint mt-4 leading-relaxed">
              * Names are collected on the consent form solely for consent purposes. They
              are kept separate from research datasets, and deleted on a set schedule.
            </p>
          </div>

          {/* Student assent form */}
          <div className="card p-5 mt-4 mb-2">
            <p className="font-serif text-base text-ink mb-2">Student assent form</p>
            <p className="text-sm text-muted leading-relaxed mb-3">
              The researcher Shivsai Sharda is conducting a survey to see how different
              designs for an AI tutoring system can affect long-term independent thinking.
              The study will occur over a three (3) week duration, and you will be expected
              to interact with an AI tutoring system for about ten (10) hours over that
              period.
            </p>
            <p className="text-sm text-muted leading-relaxed mb-2">The study involves:</p>
            <ul className="list-disc pl-5 text-sm text-muted leading-relaxed mb-3 space-y-1.5">
              <li>
                Interacting and engaging with an AI tutoring system for assistance in
                learning new mathematical topics or help with solving mathematics problems
              </li>
              <li>Taking a short survey identifying prior math knowledge and access to help</li>
              <li>
                Periodically taking short assessments to measure some facets of independent
                thinking
              </li>
            </ul>
            <p className="text-sm text-muted leading-relaxed mb-3">
              Participating in this study is your choice entirely, and you may choose to
              opt-out of the study at any time, without consequences. There are no
              significant risks to participating in this study.
            </p>
            <p className="text-sm text-muted leading-relaxed mb-4">
              Your answers and activity will remain entirely private to the principal
              investigator, and your name will never be published in the study.
            </p>

            <p className="text-sm text-ink font-medium mb-3">
              Do you agree to take part in this study?
            </p>
            <div className="flex flex-col gap-2 mb-4">
              <button
                type="button"
                onClick={() => setStudentAssent('yes')}
                className={`choice ${studentAssent === 'yes' ? 'choice-selected' : ''}`}
              >
                Yes, I agree to participate.
              </button>
              <button
                type="button"
                onClick={() => setStudentAssent('no')}
                className={`choice ${studentAssent === 'no' ? 'choice-selected' : ''}`}
              >
                No, I do not want to participate.
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
                  className="field mb-3"
                />

                <label className="label">Signature</label>
                <input
                  type="text"
                  value={studentSignature}
                  onChange={(e) => setStudentSignature(e.target.value)}
                  placeholder="Type your full name to sign"
                  className="field mb-3"
                />

                <p className="text-xs text-faint">Date: {today}</p>
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
