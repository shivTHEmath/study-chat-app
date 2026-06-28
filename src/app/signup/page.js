'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Masthead, StudyFooter, AuthSplitLayout } from '@/components/StudyChrome'

export default function SignupPage() {
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignup(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 1. Validate invite code + capacity via our API route (server checks the real secret + count)
      const checkRes = await fetch('/api/check-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      })
      const checkData = await checkRes.json()

      if (!checkRes.ok) {
        setError(checkData.error || 'Invite code check failed.')
        setLoading(false)
        return
      }

      // 2. Create the Supabase auth user (we use username@study.local as a fake email
      // since Supabase Auth requires an email-shaped identifier internally)
      const supabase = createClient()
      const fakeEmail = `${username.toLowerCase()}@study.local`

      const { data, error: signupError } = await supabase.auth.signUp({
        email: fakeEmail,
        password,
      })

      if (signupError) {
        setError(signupError.message)
        setLoading(false)
        return
      }

      // 3. Register the participant row (username + id) via API route (uses admin client)
      const registerRes = await fetch('/api/register-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, username }),
      })

      if (!registerRes.ok) {
        const registerData = await registerRes.json()
        setError(registerData.error || 'Could not finish registration.')
        setLoading(false)
        return
      }

      router.push('/survey')
    } catch (err) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <AuthSplitLayout>
      <Masthead subtitle="Create your participant account" />

      <div className="card p-7">
        <h2 className="font-serif text-xl text-ink mb-1">Create your account</h2>
        <p className="text-sm text-muted mb-6">
          Enter the invite code you were given to get started.
        </p>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="label">Invite code</label>
            <input
              type="text"
              autoCapitalize="characters"
              autoCorrect="off"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="field"
            />
          </div>

          <div>
            <label className="label">Username</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              required
              minLength={3}
              className="field"
            />
            <p className="text-xs text-faint mt-1.5">
              Letters, numbers and underscores only. This identifies you in the study.
            </p>
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="field"
            />
            <p className="text-xs text-faint mt-1.5">At least 6 characters.</p>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn-primary w-full h-12">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-muted mt-5 text-center">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-primary underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>

      <StudyFooter />
    </AuthSplitLayout>
  )
}
