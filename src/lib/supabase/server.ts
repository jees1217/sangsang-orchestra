import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * 서버 컴포넌트, Server Actions, Route Handlers에서 사용하는 Supabase 클라이언트.
 * 매 요청마다 새 인스턴스를 생성해야 합니다 (요청 간 공유 금지).
 *
 * 서버 컴포넌트에서는 쿠키를 쓸 수 없으므로 setAll은 경고만 출력합니다.
 * 실제 세션 갱신은 proxy.ts(미들웨어)에서 처리됩니다.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component에서 호출 시 쿠키 쓰기가 불가능합니다.
            // proxy.ts에서 세션을 갱신하므로 무시해도 안전합니다.
          }
        },
      },
    },
  )
}
