import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request) {
  const {
    sessionId,
    consentGiven,
    parentName,
    relationship,
    childName,
    parentSignature,
    studentName,
    studentSignature,
  } = await request.json()

  if (!sessionId || typeof consentGiven !== 'boolean') {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase.from('consent_responses').insert({
    session_id: sessionId,
    consent_given: consentGiven,
    consent_text_version: 'v1',
    parent_name: parentName || null,
    relationship: relationship || null,
    child_name: childName || null,
    parent_signature: parentSignature || null,
    student_name: studentName || null,
    student_signature: studentSignature || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const res = NextResponse.json({ ok: true })
  const cookieOpts = { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 31536000 }
  if (consentGiven) {
    // Consented: allow onboarding to proceed, and clear any prior decline.
    res.cookies.set('consent_done', '1', cookieOpts)
    res.cookies.set('consent_declined', '', { ...cookieOpts, maxAge: 0 })
  } else {
    // Declined: never mark consent done. Flag the decline so the proxy can
    // block the rest of the study, and clear any stale consent_done.
    res.cookies.set('consent_declined', '1', cookieOpts)
    res.cookies.set('consent_done', '', { ...cookieOpts, maxAge: 0 })
  }
  return res
}
