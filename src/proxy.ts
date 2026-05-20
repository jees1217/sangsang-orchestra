import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Next.js Proxy (구 middleware).
 * 모든 라우트 요청 전에 실행되어 Supabase 세션을 갱신합니다.
 *
 * - 만료된 토큰을 자동으로 갱신하여 응답 쿠키에 기록
 * - 인증되지 않은 사용자를 /login으로 리다이렉트 (보호된 경로)
 * - 이미 로그인한 사용자가 /login 접근 시 대시보드로 리다이렉트
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const isPublicRoute = pathname === '/login' || pathname === '/'

  // Protected route: redirect unauthenticated users to /login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Already logged-in user visiting /login or /: redirect to dashboard
  // BUT only if there's no ?redirected param (prevents infinite loop if
  // dashboard itself sends user back to /login due to missing profile)
  if (user && isPublicRoute) {
    const hasRedirectedFlag = request.nextUrl.searchParams.has('signout')
    if (!hasRedirectedFlag) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = '' // clear query params
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.svg$|.*\\.webp$|.*\\.ico$).*)',
  ],
}
