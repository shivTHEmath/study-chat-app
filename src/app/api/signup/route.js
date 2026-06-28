// app/api/signup/route.js
// Unified signup handler: validates invite code, creates auth user,
// atomically claims a randomized condition slot.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Service-role client: bypasses RLS and calls SECURITY DEFINER functions.
// NEVER expose this key to the browser.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req) {
  try {
    const { username, password, inviteCode } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required.' }, { status: 400 })
    }

    // Invite code gate
    if (process.env.STUDY_INVITE_CODE && inviteCode !== process.env.STUDY_INVITE_CODE) {
      return NextResponse.json({ error: 'Invalid invite code.' }, { status: 403 })
    }

    // Supabase auth requires an email; synthesize one internally.
    const syntheticEmail = `${username.toLowerCase().trim()}@study.local`

    // 1) Create the auth user (email auto-confirmed, no email sent)
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: { username },
    })

    if (authErr) {
      const taken = /already|exists|registered/i.test(authErr.message)
      return NextResponse.json(
        { error: taken ? 'That username is already taken.' : authErr.message },
        { status: taken ? 409 : 400 }
      )
    }

    const userId = created.user.id

    // 2) Atomically claim a randomized open slot (race-safe via SELECT FOR UPDATE SKIP LOCKED)
    const { data: claim, error: claimErr } = await admin.rpc('claim_condition_slot', {
      p_user_id: userId,
      p_username: username,
    })

    if (claimErr || !claim || claim.length === 0) {
      // Roll back the orphaned auth user so the pool and accounts stay consistent
      await admin.auth.admin.deleteUser(userId)
      const full = /STUDY_FULL/.test(claimErr?.message || '')
      console.error('[api/signup] claim_condition_slot failed:', claimErr?.message, claimErr?.code, claimErr?.details, claimErr?.hint)
      return NextResponse.json(
        { error: full ? 'The study is currently full.' : 'Could not assign a condition. Please try again.' },
        { status: full ? 409 : 500 }
      )
    }

    // Condition params are intentionally NOT returned to the browser —
    // the AI route fetches them server-side per request.
    return NextResponse.json({ ok: true, userId })
  } catch (e) {
    console.error('[api/signup]', e)
    return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 })
  }
}
