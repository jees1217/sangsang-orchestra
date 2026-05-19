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
          // 요청 쿠키에 반영 (하위 서버 컴포넌트가 갱신된 세션을 읽을 수 있도록)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          // 응답 객체를 새로 만들어 갱신된 요청 쿠키를 전파
          supabaseResponse = NextResponse.next({
            request,
          })
          // 응답 쿠키에도 반영 (브라우저로 전송)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser()를 호출하면 만료된 세션이 자동으로 갱신됩니다.
  // 주의: getSession()은 토큰을 검증하지 않으므로 사용하지 않습니다.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 보호된 경로: 인증되지 않은 사용자를 /login으로 리다이렉트
  const isPublicRoute = pathname === '/login' || pathname === '/'
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 이미 로그인한 사용자가 /login이나 /에 접근하면 대시보드로 리다이렉트
  if (user && (pathname === '/login' || pathname === '/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * 다음으로 시작하는 경로를 제외한 모든 요청 경로에 대해 실행:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico, sitemap.xml, robots.txt (메타데이터 파일)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
