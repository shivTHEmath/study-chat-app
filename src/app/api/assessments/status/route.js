import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  expireAssessment,
  fetchAssessmentItems,
  isAssessmentDue,
  publicAssessment,
} from '@/lib/assessments'

async function loadParticipant(admin, userId) {
  const [{ data: participant }, { data: survey }] = await Promise.all([
    admin
      .from('participants')
      .select('user_id, next_assessment_due_at')
      .eq('user_id', userId)
      .single(),
    admin
      .from('survey_responses')
      .select('responses')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (!participant) return null
  return { ...participant, grade: survey?.responses?.grade ?? null }
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const participant = await loadParticipant(admin, user.id)

  if (!participant) {
    return Response.json({ error: 'Participant record not found.' }, { status: 404 })
  }

  // Cheap due-check only — never generate here. A due assessment is generated
  // lazily when the student opens it (POST /api/assessments/start).
  const result = await isAssessmentDue(admin, user.id, participant)
  let open = result.open
  let items = []

  // An in-progress assessment past its 30-minute window is expired on read.
  if (open?.status === 'in_progress') {
    open = await expireAssessment(admin, open)
    items = open.status === 'in_progress' ? await fetchAssessmentItems(admin, open.id) : []
  }

  const available = result.due && open?.status !== 'expired'

  return Response.json({
    assessmentAvailable: Boolean(available),
    nextDueAt: result.nextDueAt || participant.next_assessment_due_at,
    assessment:
      open && open.status !== 'expired' ? publicAssessment(open, items) : null,
  })
}
