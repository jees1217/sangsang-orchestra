import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DirectorDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = ((userData?.role as string) || '').toLowerCase()

  if (role !== 'director') {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', color: '#e74c3c', marginBottom: '16px' }}>⚠️ 접근 권한 없음</h1>
        <p style={{ color: '#666' }}>디렉터(Director) 전용 페이지입니다.</p>
        <a href="/dashboard" style={{ color: '#00A99D', marginTop: '16px', display: 'inline-block' }}>
          대시보드로 돌아가기
        </a>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '28px', color: '#333', marginBottom: '16px' }}>디렉터(Director) 대시보드</h1>
      <p style={{ color: '#666' }}>여기에 디렉터 전용 기능(전체 모니터링, 공지 업로드 등)이 추가될 예정입니다.</p>
    </div>
  )
}
