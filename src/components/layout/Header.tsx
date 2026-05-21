'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './Header.module.css'

interface HeaderProps {
  email?: string
  role?: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: '관리자',
  director: '디렉터',
  teacher: '선생님',
  student: '학생'
}

export default function Header({ email, role = 'student' }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    // Use ?signout flag so proxy doesn't redirect back to /dashboard
    // while the session cookie may still be clearing
    router.push('/login?signout')
  }

  return (
    <header className={styles.header}>
      <div className={styles.userInfo}>
        <div className={styles.roleBadge}>
          {ROLE_LABELS[role] || role}
        </div>
        {email && (
          <div className={styles.email}>
            {email}
          </div>
        )}
        <Link href="/dashboard/profile" className={styles.profileBtn}>
          내 프로필
        </Link>
        <button onClick={handleLogout} className={styles.logoutBtn}>
          로그아웃
        </button>
      </div>
    </header>
  )
}
