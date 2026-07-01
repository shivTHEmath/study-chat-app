import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Toggles the engagement clock pause state for the current participant.
// Body: { paused: boolean }. When paused, the idle gap is not counted toward
// cumulative_engaged_seconds (see resolveEngagementTick Branch 1).
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const paused = Boolean(body?.paused)

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return Response.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('participants')
      .update({
        clock_paused_at: paused ? new Date().toISOString() : null,
        // Resuming counts as fresh activity so the idle window restarts.
        ...(paused ? {} : { last_activity_at: new Date().toISOString() }),
      })
      .eq('user_id', user.id)

    if (error) {
      console.error('[api/session/pause] update failed:', error.message)
      return Response.json({ error: 'Could not update session state.' }, { status: 500 })
    }

    return Response.json({ ok: true, paused })
  } catch (err) {
    console.error('[api/session/pause] failed:', err)
    return Response.json({ error: 'Could not update session state.' }, { status: 500 })
  }
}
