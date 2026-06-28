'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usernameToEmail } from '@/lib/usernameEmail'
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

      // 2. Create the auth user + participant row server-side. The account is
      // created with the admin API (email auto-confirmed, no email sent); the
      // public client-side signUp can't be used because it rejects the synthetic
      // address and would try to send a confirmation email.
      const registerRes = await fetch('/api/register-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!registerRes.ok) {
        const registerData = await registerRes.json()
        setError(registerData.error || 'Could not finish registration.')
        setLoading(false)
        return
      }

      // 3. Sign in to establish a session, then continue into the study.
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      })

      if (signInError) {
        setError('Account created, but sign in failed. Please try logging in.')
        setLoading(false)
        return
      }

      router.push('/chat')
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
              placeholder="e.g. fifacup30"
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
