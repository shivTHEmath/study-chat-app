import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchAssessmentItems,
  maybeCreateDueAssessment,
  publicAssessment,
  startAssessment,
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

export async function POST() {
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
  if (!result.assessment) {
    return Response.json(
      {
        error:
          result.unavailableReason === 'no_source_questions'
            ? 'There are not enough prior questions to build an assessment yet.'
            : 'No assessment is available yet.',
        blockedByActiveProblem: Boolean(result.blockedByActiveProblem),
        nextDueAt: result.nextDueAt || participant.next_assessment_due_at,
      },
      { status: 409 }
    )
  }

  const assessment = await startAssessment(admin, result.assessment)
  const items = await fetchAssessmentItems(admin, assessment.id)

  return Response.json({
    assessment: publicAssessment(assessment, items),
  })
}
