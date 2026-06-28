import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request) {
  const { inviteCode } = await request.json()

  if (inviteCode !== process.env.STUDY_INVITE_CODE) {
    return Response.json({ error: 'Invalid invite code.' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })

  if (error) {
    return Response.json({ error: 'Could not verify capacity.' }, { status: 500 })
  }

  const maxParticipants = parseInt(process.env.STUDY_MAX_PARTICIPANTS || '100', 10)
  if (count >= maxParticipants) {
    return Response.json({ error: 'This study has reached its participant limit.' }, { status: 403 })
  }

  return Response.json({ ok: true })
}
