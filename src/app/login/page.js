'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Masthead, StudyFooter } from '@/components/StudyChrome'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const fakeEmail = `${username.toLowerCase()}@study.local`

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: fakeEmail,
      password,
    })

    if (loginError) {
      setError('Incorrect username or password.')
      setLoading(false)
      return
    }

    router.push('/chat')
  }

  return (
    <main className="flex flex-1 flex-col lg:flex-row min-h-[100dvh]">
      {/* Left — sign in */}
      <div className="flex flex-1 items-center justify-center px-4 py-10 lg:py-12">
        <div className="w-full max-w-md">
          <Masthead subtitle="Participant sign in" />

          <div className="card p-7">
            <h2 className="font-serif text-xl text-ink mb-1">Welcome back</h2>
            <p className="text-sm text-muted mb-6">Log in to continue your sessions.</p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="field"
                />
              </div>

              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="field"
                />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <button type="submit" disabled={loading} className="btn btn-primary w-full h-12">
                {loading ? 'Logging in…' : 'Log in'}
              </button>
            </form>

            <p className="text-sm text-muted mt-5 text-center">
              Need an account?{' '}
              <Link href="/signup" className="font-semibold text-primary underline underline-offset-2">
                Sign up
              </Link>
            </p>
          </div>

          <StudyFooter />
        </div>
      </div>

      {/* Right — study side panel */}
      <aside className="lg:w-[44%] lg:max-w-xl bg-primary text-white flex flex-col">
        {/* Media: placeholder for a "how to participate" video */}
        <div className="relative flex-1 min-h-56 lg:min-h-0 aspect-video lg:aspect-auto bg-primary-strong flex items-center justify-center border-b border-white/10">
          <div className="flex flex-col items-center gap-3 text-white/55">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/30">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="text-sm font-medium">How to participate</span>
            <span className="text-xs text-white/40">Video coming soon</span>
          </div>
        </div>

        {/* Reminder copy */}
        <div className="px-8 py-9 lg:px-10 lg:py-12">
          <p className="eyebrow text-white/60">You are entering the study</p>
          <h2 className="font-serif text-2xl text-white mt-2">
            AI Tutoring Study
          </h2>
          <p className="text-sm leading-relaxed text-white/75 mt-3">
            By logging in you are continuing your participation in this research
            study. Each session you complete contributes to research on how AI
            tutoring tools affect students&apos; independent reasoning in
            mathematics.
          </p>
          <p className="text-sm leading-relaxed text-white/75 mt-3">
            Watch the introduction above to see how to take part. Your activity
            stays private to the principal investigator, and you may withdraw at
            any time.
          </p>
        </div>
      </aside>
    </main>
  )
}
