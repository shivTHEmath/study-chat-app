import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request) {
  const { userId, username } = await request.json()

  if (!userId || !username) {
    return Response.json({ error: 'Missing userId or username.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Re-check capacity at insert time too (race-condition safety net for near-simultaneous signups)
  const { count } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })

  const maxParticipants = parseInt(process.env.MAX_PARTICIPANTS || '100', 10)
  if (count >= maxParticipants) {
    return Response.json({ error: 'This study has reached its participant limit.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('participants')
    .insert({ id: userId, username })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
