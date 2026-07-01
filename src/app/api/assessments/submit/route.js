import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { submitAssessment } from '@/lib/assessments'

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const {
    assessmentId,
    responses,
    allowPartial,
    selfEstimatedCorrect,
    selfRatedLearning,
    selfRatedDifficulty,
  } = body || {}
  if (!assessmentId || !Array.isArray(responses)) {
    return Response.json({ error: 'Missing assessment responses.' }, { status: 400 })
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
  const result = await submitAssessment(admin, user.id, assessmentId, responses, {
    allowPartial: Boolean(allowPartial),
    selfReport: { selfEstimatedCorrect, selfRatedLearning, selfRatedDifficulty },
  })

  if (result.error) {
    return Response.json({ error: result.error }, { status: result.status || 400 })
  }

  return Response.json({
    score: result.score,
    selfEstimatedScore: result.selfEstimatedScore,
    selfRatedLearning: result.selfRatedLearning,
    selfRatedDifficulty: result.selfRatedDifficulty,
    calibrationError: result.calibrationError,
    submittedLate: result.submittedLate,
    nextDueAt: result.nextDueAt,
    responses: result.responses,
  })
}
