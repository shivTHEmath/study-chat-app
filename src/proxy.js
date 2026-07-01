import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function proxy(request) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api')
  const publicRoutes = ['/consent', '/consent/declined', '/survey', '/video', '/signup', '/login']
  const isPublic = publicRoutes.some((r) => pathname === r || pathname.startsWith(r + '/'))

  // Helper to build a redirect response.
  const redirect = (dest) => {
    const url = request.nextUrl.clone()
    url.pathname = dest
    return NextResponse.redirect(url)
  }

  // Logged-in users skip all auth/onboarding screens entirely.
  if (user) {
    const bypassPaths = ['/', '/login', '/signup', '/consent', '/survey']
    if (bypassPaths.some((r) => pathname === r || pathname.startsWith(r + '/'))) {
      return redirect('/chat')
    }
  }

  // Unauthenticated routing driven by onboarding completion cookies.
  if (!user) {
    const consentDone = request.cookies.get('consent_done')?.value === '1'
    const surveyDone = request.cookies.get('survey_done')?.value === '1'

    // Root: send to the right step.
    if (pathname === '/') {
      if (consentDone && surveyDone) return redirect('/login')
      if (consentDone) return redirect('/survey')
      return redirect('/consent')
    }

    // Consent page: skip forward if already completed.
    if (pathname === '/consent') {
      if (consentDone && surveyDone) return redirect('/login')
      if (consentDone) return redirect('/survey')
    }

    // Survey page: requires consent first; skip forward if both done.
    if (pathname === '/survey') {
      if (consentDone && surveyDone) return redirect('/login')
      if (!consentDone) return redirect('/consent')
    }

    // Any other protected route: route to login if onboarding is done, else start at consent.
    if (!isPublic && !isApi) {
      return consentDone && surveyDone ? redirect('/login') : redirect('/consent')
    }
  }

  return supabaseResponse
}

export default proxy

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
