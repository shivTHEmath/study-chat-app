import { NextResponse } from 'next/server'
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('survey_done', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 31536000,
  })
  return res
}
