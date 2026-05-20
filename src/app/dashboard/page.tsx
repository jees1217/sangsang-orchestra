import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardRedirect() {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch user role from public.users table
  const { data: userData, error: dbError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (dbError || !userData) {
    console.error('DB 권한 조회 실패 (page):', dbError || 'No userData returned')
  }

  // Normalize role to lowercase to match folder names: /dashboard/admin, etc.
  // Fallback to 'student' if DB query fails (e.g., no profile row yet)
  const role = ((userData?.role as string) || 'student').toLowerCase()

  // Only redirect if the role maps to a valid sub-page
  const validRoles = ['admin', 'director', 'teacher', 'student']
  const targetRole = validRoles.includes(role) ? role : 'student'
  
  redirect(`/dashboard/${targetRole}`)
}
