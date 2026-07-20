import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const GOAL_SECONDS = 10 * 3600

async function getAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return error || !user ? null : user
}

// GET → { eligible, claimed } for the reward banner.
export async function GET() {
  try {
    const user = await getAuthedUser()
    if (!user) return Response.json({ error: 'Unauthorised.' }, { status: 401 })

    const admin = createAdminClient()
    const [{ data: participant }, { data: claim }] = await Promise.all([
      admin
        .from('participants')
        .select('cumulative_engaged_seconds')
        .eq('user_id', user.id)
        .maybeSingle(),
      admin
        .from('reward_claims')
        .select('claimed_at')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    return Response.json({
      eligible: Number(participant?.cumulative_engaged_seconds || 0) >= GOAL_SECONDS,
      claimed: Boolean(claim),
    })
  } catch (err) {
    console.error('[api/reward] GET failed:', err)
    return Response.json({ eligible: false, claimed: false })
  }
}

// POST { parentEmail, parentPhone } → records the claim.
// Eligibility is re-verified server-side; both contact fields are required.
export async function POST(request) {
  try {
    const user = await getAuthedUser()
    if (!user) return Response.json({ error: 'Unauthorised.' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parentEmail = String(body?.parentEmail || '').trim()
    const parentPhone = String(body?.parentPhone || '').trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      return Response.json({ error: 'Please enter a valid parent email address.' }, { status: 400 })
    }
    if (parentPhone.replace(/\D/g, '').length < 7) {
      return Response.json({ error: 'Please enter a valid parent phone number.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: participant } = await admin
      .from('participants')
      .select('cumulative_engaged_seconds')
      .eq('user_id', user.id)
      .maybeSingle()

    if (Number(participant?.cumulative_engaged_seconds || 0) < GOAL_SECONDS) {
      return Response.json(
        { error: 'The reward unlocks after 10 hours of study time. Keep going!' },
        { status: 403 }
      )
    }

    const { error: insertError } = await admin.from('reward_claims').insert({
      user_id: user.id,
      parent_email: parentEmail,
      parent_phone: parentPhone,
    })

    if (insertError) {
      // 23505 = unique_violation → already claimed
      if (insertError.code === '23505') {
        return Response.json({ error: 'Reward already claimed.', claimed: true }, { status: 409 })
      }
      console.error('[api/reward] insert failed:', insertError.message)
      return Response.json({ error: 'Could not record your claim. Please try again.' }, { status: 500 })
    }

    return Response.json({ claimed: true })
  } catch (err) {
    console.error('[api/reward] POST failed:', err)
    return Response.json({ error: 'Could not record your claim. Please try again.' }, { status: 500 })
  }
}
