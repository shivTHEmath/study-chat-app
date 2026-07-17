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
    // Rank all participants by study time (descending); nulls sort last
    const { data, error } = await admin
      .from('participants')
      .select('user_id, slot_id, cumulative_engaged_seconds')
      .order('cumulative_engaged_seconds', { ascending: false, nullsFirst: false })

    if (error || !data) {
      console.error('[api/ranking] lookup failed:', error?.message)
      return Response.json({ neighborhood: [], myRank: null, total: 0 })
    }

    const total = data.length
    const myIndex = data.findIndex((p) => p.user_id === user.id)

    if (myIndex === -1) {
      return Response.json({ neighborhood: [], myRank: null, total })
    }

    const myRank = myIndex + 1
    const start = Math.max(0, myIndex - 2)
    const end = Math.min(total - 1, myIndex + 2)

    const neighborhood = data.slice(start, end + 1).map((p, i) => ({
      rank: start + i + 1,
      isMe: p.user_id === user.id,
      seconds: Number(p.cumulative_engaged_seconds || 0),
      // Use slot_id as a stable anonymous participant number; fall back to rank
      slotId: p.slot_id ?? start + i + 1,
    }))

    return Response.json({ neighborhood, myRank, total })
  } catch (err) {
    console.error('[api/ranking] failed:', err)
    return Response.json({ neighborhood: [], myRank: null, total: 0 })
  }
}
