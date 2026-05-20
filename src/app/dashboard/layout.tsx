import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import styles from './layout.module.css'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  
  // 1. Check if user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    // Not authenticated → send to login
    redirect('/login')
  }

  // 2. Try to fetch user's role from DB
  const { data: userData, error: dbError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (dbError || !userData) {
    console.error('DB 권한 조회 실패:', dbError || 'No userData returned')
  }

  // ⚠️ CRITICAL: Do NOT redirect to /login here if DB query fails.
  // The user IS authenticated (proxy verified this). If we redirect to /login,
  // proxy will see an authenticated user on /login and redirect back to /dashboard,
  // creating an infinite redirect loop.
  //
  // Instead, use a sensible fallback role.
  const rawRole = (userData?.role as string) || 'student'
  const role = rawRole.toLowerCase() as 'admin' | 'director' | 'teacher' | 'student'

  return (
    <div className={styles.container}>
      <Sidebar role={role} />
      
      <div className={styles.main}>
        <Header email={user.email} role={role} />
        
        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  )
}
