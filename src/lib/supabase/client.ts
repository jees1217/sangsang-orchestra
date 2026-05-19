import { createBrowserClient } from '@supabase/ssr'

/**
 * 브라우저(클라이언트 컴포넌트)에서 사용하는 Supabase 클라이언트.
 * 쿠키 관리는 @supabase/ssr가 자동 처리합니다.
 * 싱글턴으로 동작하여 동일 탭 내에서 하나의 인스턴스만 생성됩니다.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
