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
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
