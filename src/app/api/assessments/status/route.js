import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  expireAssessment,
  fetchAssessmentItems,
  maybeCreateDueAssessment,
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

  const result = await maybeCreateDueAssessment(admin, user.id, participant)
  let assessment = result.assessment
  let items = result.items || []

  if (assessment?.status === 'in_progress') {
    assessment = await expireAssessment(admin, assessment)
    items = assessment.status === 'in_progress' ? await fetchAssessmentItems(admin, assessment.id) : []
  }

  return Response.json({
    assessmentAvailable: Boolean(assessment && assessment.status !== 'expired'),
    blockedByActiveProblem: Boolean(result.blockedByActiveProblem),
    unavailableReason: result.unavailableReason || null,
    nextDueAt: result.nextDueAt || participant.next_assessment_due_at,
    assessment:
      assessment && assessment.status !== 'expired'
        ? publicAssessment(assessment, items)
        : null,
  })
}
