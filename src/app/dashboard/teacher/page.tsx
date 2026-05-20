import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function TeacherDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'teacher') {
    redirect('/dashboard') // redirect back to the hub to be routed correctly
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '28px', color: '#333', marginBottom: '16px' }}>선생님(Teacher) 대시보드</h1>
      <p style={{ color: '#666' }}>여기에 선생님 전용 기능(배정된 학생 관리, 출결, 평가 등)이 추가될 예정입니다.</p>
    </div>
  )
}
