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
    // fallback if no role found
    redirect('/dashboard/student')
  }

  const role = userData.role
  // role is one of 'admin', 'director', 'teacher', 'student'
  redirect(`/dashboard/${role}`)
}
