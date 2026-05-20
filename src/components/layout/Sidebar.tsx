'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './Sidebar.module.css'

type Role = 'admin' | 'director' | 'teacher' | 'student'

interface SidebarProps {
  role: Role
}

const MENUS = {
  student: [
    { label: '내 과제', path: '/dashboard/student/assignments', icon: '📝' },
    { label: '악보 보기', path: '/dashboard/student/scores', icon: '🎵' },
    { label: '온라인 수업', path: '/dashboard/student/class', icon: '💻' },
  ],
  teacher: [
    { label: '내 학생 관리', path: '/dashboard/teacher/students', icon: '👥' },
    { label: '과제/공지 관리', path: '/dashboard/teacher/assignments', icon: '📋' },
    { label: '출결/평가 관리', path: '/dashboard/teacher/evaluations', icon: '✔️' },
  ],
  director: [
    { label: '전체 모니터링', path: '/dashboard/director/monitoring', icon: '📊' },
    { label: '출결/평가 현황', path: '/dashboard/director/status', icon: '📈' },
    { label: '공지 관리', path: '/dashboard/director/notices', icon: '📢' },
  ],
  admin: [
    { label: '단원 관리', path: '/dashboard/admin/members', icon: '🧑‍🤝‍🧑' },
    { label: '전체 통계', path: '/dashboard/admin/stats', icon: '📊' },
    { label: '온라인 수업 관리', path: '/dashboard/admin/class-links', icon: '🔗' },
  ]
}

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const currentMenus = MENUS[role] || MENUS['student']

  return (
    <aside className={styles.sidebar}>
      <Link href={`/dashboard/${role}`} className={styles.logoContainer}>
        <div className={styles.logoCircle}>♪</div>
        <div className={styles.logoText}>
          상상휠하모니
          <span>오케스트라</span>
        </div>
      </Link>

      <ul className={styles.menuList}>
        {currentMenus.map((menu) => {
          // Check if current path matches the menu path
          // For active state, we can check if pathname starts with menu.path
          const isActive = pathname.startsWith(menu.path)
          
          return (
            <li key={menu.path}>
              <Link
                href={menu.path}
                className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ''}`}
              >
                <span style={{ marginRight: '12px' }}>{menu.icon}</span>
                {menu.label}
              </Link>
            </li>
          )
        })}
      </ul>

      <div className={styles.footer}>
        © 2026 Sangsang
      </div>
    </aside>
  )
}
