import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TOPIC_BANDS, bandForGrade, topicById } from '@/lib/tutor/topics'

// GET → the topic tiles for this student.
// Grade known: only their band. Grade unknown: all bands (UI shows them grouped).
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return Response.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data } = await admin
      .from('survey_responses')
      .select('responses')
      .eq('user_id', user.id)
      .maybeSingle()

    const band = bandForGrade(data?.responses?.grade)
    const bands = band ? TOPIC_BANDS.filter((b) => b.band === band) : TOPIC_BANDS

    return Response.json({ band, bands })
  } catch (err) {
    console.error('[api/suggest] GET failed:', err)
    return Response.json({ band: null, bands: TOPIC_BANDS })
  }
}

// POST { topicId } → 3 questions (easy / medium / challenge) from the shared
// question bank, excluding ones this user has already been served. Zero AI
// calls: the bank is pre-seeded (migrations/022_question_bank.sql).
// If the user has exhausted a level, their least-recently-served question for
// that level is recycled rather than failing.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)
    const topic = topicById(body?.topicId)
    if (!topic) {
      return Response.json({ error: 'Unknown topic.' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return Response.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const admin = createAdminClient()

    // All bank questions for this topic + everything this user has been served.
    const [{ data: bank, error: bankError }, { data: served }] = await Promise.all([
      admin
        .from('question_bank')
        .select('id, level, question, answer')
        .eq('topic_id', topic.id)
        .eq('band', topic.band),
      admin
        .from('served_suggestions')
        .select('question_id, served_at')
        .eq('user_id', user.id),
    ])

    if (bankError || !bank?.length) {
      console.error('[api/suggest] bank lookup failed:', bankError?.message)
      return Response.json({ error: 'No questions available for this topic yet.' }, { status: 404 })
    }

    const servedAt = new Map((served || []).map((s) => [s.question_id, s.served_at]))

    const picks = []
    for (const level of ['easy', 'medium', 'challenge']) {
      const pool = bank.filter((q) => q.level === level)
      if (!pool.length) continue

      const unseen = pool.filter((q) => !servedAt.has(q.id))
      let pick
      if (unseen.length) {
        pick = unseen[Math.floor(Math.random() * unseen.length)]
      } else {
        // Exhausted: recycle the least-recently-served question of this level.
        pick = pool
          .slice()
          .sort((a, b) => new Date(servedAt.get(a.id)) - new Date(servedAt.get(b.id)))[0]
      }
      picks.push({ id: pick.id, level, question: pick.question })
    }

    if (!picks.length) {
      return Response.json({ error: 'No questions available for this topic yet.' }, { status: 404 })
    }

    // Record serves. upsert keeps the primary key happy for recycled questions
    // (served_at refreshes so the recycle rotation keeps moving).
    const { error: serveError } = await admin.from('served_suggestions').upsert(
      picks.map((p) => ({
        user_id: user.id,
        question_id: p.id,
        served_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,question_id' }
    )
    if (serveError) {
      console.error('[api/suggest] serve tracking failed:', serveError.message)
    }

    return Response.json({
      topic: topic.label,
      band: topic.band,
      problems: picks.map((p) => ({ level: p.level, text: p.question })),
    })
  } catch (err) {
    console.error('[api/suggest] POST failed:', err)
    return Response.json({ error: 'Could not load suggestions. Please try again.' }, { status: 500 })
  }
}
