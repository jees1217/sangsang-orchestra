import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import styles from './page.module.css'

import MemberListClient from './MemberListClient'

async function MembersTableLoader({ viewerRole }: { viewerRole: string }) {
  const supabase = await createClient()

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, name, role, cohort, instrument, created_at, class_id, guardian, phone, address, note')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('단원 명부 조회 실패:', error)
    return (
      <div className={styles.error}>
        <h3>데이터를 불러오는 데 실패했습니다.</h3>
        <p>{error.message}</p>
        <p>터미널에서 상세 에러를 확인해 주세요. (RLS 문제일 수 있습니다)</p>
      </div>
    )
  }

  if (!users || users.length === 0) {
    return <div className={styles.loading}>등록된 단원이 없습니다.</div>
  }

  return <MemberListClient initialUsers={users} viewerRole={viewerRole} />
}

export default async function MembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = ((userData?.role as string) || '').toLowerCase()

  if (role !== 'admin' && role !== 'director') {
    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', color: '#e74c3c', marginBottom: '16px' }}>⚠️ 접근 권한 없음</h1>
        <p style={{ color: '#666' }}>관리자 및 디렉터 전용 페이지입니다.</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>단원 명부</h1>
      <Suspense fallback={<div className={styles.loading}>데이터를 불러오는 중입니다...</div>}>
        <MembersTableLoader viewerRole={role} />
      </Suspense>
    </div>
  )
}
