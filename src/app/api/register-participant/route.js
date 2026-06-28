import { createAdminClient } from '@/lib/supabase/admin'
import { usernameToEmail } from '@/lib/usernameEmail'

export async function POST(request) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return Response.json({ error: 'Missing username or password.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Re-check capacity at insert time too (race-condition safety net for near-simultaneous signups)
  const { count } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })

  const maxParticipants = parseInt(process.env.STUDY_MAX_PARTICIPANTS || '100', 10)
  if (count >= maxParticipants) {
    return Response.json({ error: 'This study has reached its participant limit.' }, { status: 403 })
  }

  // Create the auth user server-side and auto-confirm it. The public client-side
  // signUp endpoint both rejects the `.local` address as invalid and tries to
  // send a confirmation email that would never arrive, so account creation must
  // happen here with the admin API.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  })

  if (createError) {
    const taken = /already|registered|exists/i.test(createError.message)
    return Response.json(
      { error: taken ? 'That username is already taken.' : createError.message },
      { status: taken ? 409 : 500 }
    )
  }

  const userId = created.user.id

  const { error: insertError } = await supabase
    .from('participants')
    .insert({ id: userId, username })

  if (insertError) {
    // Roll back the orphaned auth user so the participant can retry.
    await supabase.auth.admin.deleteUser(userId)
    const taken = /duplicate|unique/i.test(insertError.message)
    return Response.json(
      { error: taken ? 'That username is already taken.' : insertError.message },
      { status: taken ? 409 : 500 }
    )
  }

  return Response.json({ ok: true })
}
