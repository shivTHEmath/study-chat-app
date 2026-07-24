import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Debounced autosave of in-progress assessment answers. No grading, no LLM —
// just persists whatever the student has typed so a closed/slept/disconnected
// tab doesn't lose the work before the timer's auto-submit can fire. Grading
// still happens only at /submit. Also served by navigator.sendBeacon on
// tab-hide, so keep this cheap and tolerant of malformed/empty bodies.
export async function POST(request) {
  const body = await request.json().catch(() => null)
  const { assessmentId, answers } = body || {}

  if (!assessmentId || typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    return Response.json({ error: 'Missing draft answers.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Only an in-progress assessment owned by this user accepts drafts. A
  // submitted/expired one is a silent no-op — a late beacon must never revive or
  // mutate a finished attempt.
  const { data: updated } = await admin
    .from('assessments')
    .update({ draft_answers: answers, updated_at: new Date().toISOString() })
    .eq('id', assessmentId)
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .select('id')
    .maybeSingle()

  return Response.json({ ok: Boolean(updated) })
}
