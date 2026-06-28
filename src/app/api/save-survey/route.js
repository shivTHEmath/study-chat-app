import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request) {
  const { sessionId, responses } = await request.json()

  if (!sessionId || !responses || typeof responses !== 'object') {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase.from('survey_responses').insert({
    session_id: sessionId,
    responses,
  })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
