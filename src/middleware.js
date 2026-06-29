// Supabase SSR middleware — runs on every request before the page renders.
// Responsibilities:
//   1. Refresh the Supabase session cookie so auth tokens stay valid.
//   2. Redirect unauthenticated users away from protected routes.
//
// IMPORTANT: do not use createClient() from @/lib/supabase/server here —
// that helper relies on next/headers which is not available in middleware.
// Always build the client inline with the request/response cookie pattern.

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Routes that require an authenticated session.
const PROTECTED_PREFIXES = ['/chat']

// Routes that authenticated users should be bounced away from
// (e.g., login page when already signed in).
const AUTH_PREFIXES = ['/login', '/signup']

export async function middleware(request) {
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
          // Write cookies to both the request (for downstream reads) and the
          // response (so the browser receives the refreshed token).
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: always call getUser() (not getSession()) — getUser() validates
  // the token server-side and cannot be spoofed by a tampered cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Unauthenticated user trying to reach a protected page → /login
  if (!user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user trying to reach login/signup → /chat
  if (user && AUTH_PREFIXES.some((p) => pathname.startsWith(p))) {
    const chatUrl = request.nextUrl.clone()
    chatUrl.pathname = '/chat'
    return NextResponse.redirect(chatUrl)
  }

  return supabaseResponse
}

export const config = {
  // Run on all routes except Next.js internals and static files.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
