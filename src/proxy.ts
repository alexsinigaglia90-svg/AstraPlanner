import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

/** Create a redirect that preserves session cookies from updateSession */
function redirectWithCookies(url: URL, sessionResponse: NextResponse) {
  const redirect = NextResponse.redirect(url)
  sessionResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c))
  return redirect
}

/**
 * Build a strict, nonce-based Content-Security-Policy for the current
 * request. Returned in Report-Only mode (not enforced) so we can observe
 * what would break before switching on enforcement. The current
 * enforced CSP in next.config.ts stays active in parallel.
 *
 * Rollout plan (documented in §15 of the security doc):
 *  1. Report-Only for an observation period — this commit.
 *  2. Triage violations in the browser console / reporting endpoint.
 *  3. Adjust the nonce propagation in layout.tsx if needed.
 *  4. Switch to enforced CSP, remove 'unsafe-inline' from the
 *     enforced policy in next.config.ts.
 */
function buildStrictCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // strict-dynamic: trusted scripts (those carrying this nonce) can
    // load further scripts, but anything without the nonce is blocked.
    // 'unsafe-inline' is a fallback for very old browsers that don't
    // understand strict-dynamic — they will use 'unsafe-inline' and
    // lose the upgrade, which is the right tradeoff for a report-only
    // shadow policy.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'`,
    // Styles: Tailwind and framer-motion still emit inline styles that
    // cannot carry nonces without substantial rewrites. Keep unsafe-inline
    // here until we either switch to <style nonce> + extract or accept
    // the residual risk.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join('; ')
}

/**
 * Generate 16 random bytes (128 bits) as a base64 nonce. Crypto-grade
 * randomness per request, suitable for use in script-src 'nonce-<...>'.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // btoa is available in the Edge runtime.
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)

  // Generate a per-request nonce and expose it both:
  //   1. As an 'x-nonce' request header so server components (layouts)
  //      can read it via next/headers and apply it to inline <script>
  //      tags they render.
  //   2. As a Content-Security-Policy-Report-Only header on the
  //      response so browsers start reporting violations against the
  //      strict policy without blocking the request.
  const nonce = generateNonce()
  response.headers.set('x-nonce', nonce)
  response.headers.set(
    'Content-Security-Policy-Report-Only',
    buildStrictCsp(nonce),
  )

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
