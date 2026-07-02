import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
// onboarding@resend.dev works without verifying a domain, and delivers to the
// Resend account owner's own address (which is our recipient here).
const FEEDBACK_FROM = process.env.FEEDBACK_FROM_EMAIL || 'Study Feedback <onboarding@resend.dev>'

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const message = String(body?.message || '').trim()

  if (!message) {
    return Response.json({ error: 'Please describe the bug.' }, { status: 400 })
  }
  if (message.length > 5000) {
    return Response.json({ error: 'That report is too long.' }, { status: 400 })
  }

  // Must be a logged-in participant.
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return Response.json({ error: 'You must be logged in.' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[api/feedback] RESEND_API_KEY not configured')
    return Response.json({ error: 'Feedback is not configured right now.' }, { status: 500 })
  }

  const toEmail = process.env.FEEDBACK_TO_EMAIL || 'shivsai1811@gmail.com'

  // Attach the username for triage — the student is never asked for it.
  let username = null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('participants')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle()
    username = data?.username ?? null
  } catch {
    // Non-fatal — send the report even if the lookup fails.
  }

  const who = username ? `@${username}` : user.id

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FEEDBACK_FROM,
        to: [toEmail],
        subject: `AI Tutoring Study — bug report from ${who}`,
        reply_to: toEmail,
        text: `Bug report from ${who} (user id ${user.id})\n\n${message}`,
        html:
          `<p style="color:#56616f;font-size:13px;margin:0 0 12px">` +
          `Bug report from <strong>${escapeHtml(who)}</strong> ` +
          `<span style="color:#8b94a1">(user id ${escapeHtml(user.id)})</span></p>` +
          `<div style="white-space:pre-wrap;font-size:15px;line-height:1.5;color:#1b2735">` +
          `${escapeHtml(message)}</div>`,
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('[api/feedback] Resend error:', res.status, detail)
      return Response.json({ error: 'Could not send your report. Please try again.' }, { status: 502 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[api/feedback] send failed:', err)
    return Response.json({ error: 'Could not send your report. Please try again.' }, { status: 502 })
  }
}
