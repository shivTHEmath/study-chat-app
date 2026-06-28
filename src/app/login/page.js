'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usernameToEmail } from '@/lib/usernameEmail'
import { Masthead, StudyFooter, AuthSplitLayout } from '@/components/StudyChrome'

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

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
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
    <AuthSplitLayout>
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
              placeholder="e.g. fifacup30"
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
    </AuthSplitLayout>
  )
}
