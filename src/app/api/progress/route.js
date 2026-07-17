import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const { data, error } = await admin
      .from('participants')
      .select('problems_completed, cumulative_engaged_seconds')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('[api/progress] lookup failed:', error.message)
      return Response.json({ problemsCompleted: 0, cumulativeEngagedSeconds: 0 })
    }

    return Response.json({
      problemsCompleted: Number(data?.problems_completed || 0),
      cumulativeEngagedSeconds: Number(data?.cumulative_engaged_seconds || 0),
    })
  } catch (err) {
    console.error('[api/progress] failed:', err)
    return Response.json({ problemsCompleted: 0 })
  }
}
