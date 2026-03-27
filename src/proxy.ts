import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

/** Create a redirect that preserves session cookies from updateSession */
function redirectWithCookies(url: URL, sessionResponse: NextResponse) {
  const redirect = NextResponse.redirect(url)
  sessionResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c))
  return redirect
}

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Auth callback — always allow through (token exchange)
  if (pathname.startsWith('/auth/callback')) {
    return response
  }

  // Auth pages — redirect based on onboarding state
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    if (user) {
      const hasOrg = !!user.app_metadata?.organization_id
      const isDemo = user.app_metadata?.mode === 'demo'
      if (hasOrg || isDemo) {
        return redirectWithCookies(new URL('/dashboard', request.url), response)
      }
      return redirectWithCookies(new URL('/welcome', request.url), response)
    }
    return response
  }

  // Reset password — must be authenticated
  if (pathname.startsWith('/reset-password')) {
    if (!user) {
      return redirectWithCookies(new URL('/login', request.url), response)
    }
    return response
  }

  // Welcome/onboarding — must be authenticated, must NOT have org/demo
  if (pathname.startsWith('/welcome')) {
    if (!user) {
      return redirectWithCookies(new URL('/login', request.url), response)
    }
    const hasOrg = !!user.app_metadata?.organization_id
    const isDemo = user.app_metadata?.mode === 'demo'
    if (hasOrg || isDemo) {
      return redirectWithCookies(new URL('/dashboard', request.url), response)
    }
    return response
  }

  // Protected pages — require auth + org or demo mode
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return redirectWithCookies(new URL('/login', request.url), response)
    }
    const hasOrg = !!user.app_metadata?.organization_id
    const isDemo = user.app_metadata?.mode === 'demo'
    if (!hasOrg && !isDemo) {
      return redirectWithCookies(new URL('/welcome', request.url), response)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
